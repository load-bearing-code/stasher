//! Userspace NFSv3 client: writes media straight to an export over the
//! network, so nothing has to be mounted on the host.

use std::future::Future;
use std::net::IpAddr;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use async_trait::async_trait;
use nfs3_client::nfs3_types::mount::{PROGRAM as MOUNT_PROGRAM, VERSION as MOUNT_VERSION};
use nfs3_client::nfs3_types::nfs3::{self, Nfs3Option, Nfs3Result};
use nfs3_client::nfs3_types::portmap::{IPPROTO_TCP, PMAP_PORT};
use nfs3_client::nfs3_types::rpc::{auth_unix, opaque_auth};
use nfs3_client::nfs3_types::xdr_codec::Opaque;
use nfs3_client::tokio::{TokioConnector, TokioIo};
use nfs3_client::{MountClient, Nfs3Connection, Nfs3ConnectionBuilder, PortmapperClient};
use stasher_protocol::{NfsShareConfig, StashJob};
use tokio::net::TcpStream;

use crate::error::CoreError;
use crate::nfs::{LocalFsWriter, NfsWriter};

type Connection = Nfs3Connection<TokioIo<TcpStream>>;

const TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_CHUNK: usize = 32 * 1024;
const MAX_CHUNK: usize = 1024 * 1024;

fn nfs_err(context: &str, err: impl std::fmt::Display) -> CoreError {
    CoreError::Nfs(format!("{context}: {err}"))
}

async fn with_timeout<T>(
    what: &str,
    future: impl Future<Output = Result<T, CoreError>>,
) -> Result<T, CoreError> {
    tokio::time::timeout(TIMEOUT, future)
        .await
        .map_err(|_| CoreError::Nfs(format!("{what} timed out")))?
}

fn check<T, E>(result: Nfs3Result<T, E>, context: &str) -> Result<T, CoreError> {
    match result {
        Nfs3Result::Ok(value) => Ok(value),
        Nfs3Result::Err((code, _)) => Err(nfs_err(context, code)),
    }
}

// The crate only accepts IP addresses, so hostnames are resolved here.
async fn resolve_host(server: &str) -> Result<IpAddr, CoreError> {
    if let Ok(ip) = server.parse::<IpAddr>() {
        return Ok(ip);
    }
    let addrs: Vec<_> = tokio::net::lookup_host((server, 0))
        .await
        .map_err(|err| nfs_err(&format!("could not resolve {server}"), err))?
        .collect();
    addrs
        .iter()
        .find(|addr| addr.is_ipv4())
        .or(addrs.first())
        .map(|addr| addr.ip())
        .ok_or_else(|| CoreError::Nfs(format!("could not resolve {server}")))
}

#[cfg(unix)]
fn current_ids() -> (u32, u32) {
    // SAFETY: getuid/getgid take no arguments and cannot fail.
    unsafe { (libc::getuid(), libc::getgid()) }
}

#[cfg(not(unix))]
fn current_ids() -> (u32, u32) {
    (0xffff_fffe, 0xffff_fffe)
}

fn credential() -> opaque_auth<'static> {
    let (uid, gid) = current_ids();
    opaque_auth::auth_unix(&auth_unix {
        stamp: 0,
        machinename: Opaque::borrowed(b"stasher"),
        uid,
        gid,
        gids: vec![],
    })
}

fn dirop<'a>(dir: &nfs3::nfs_fh3, name: &'a str) -> nfs3::diropargs3<'a> {
    nfs3::diropargs3 {
        dir: dir.clone(),
        name: nfs3::filename3(Opaque::borrowed(name.as_bytes())),
    }
}

async fn lookup(
    conn: &mut Connection,
    dir: &nfs3::nfs_fh3,
    name: &str,
) -> Result<Option<nfs3::nfs_fh3>, CoreError> {
    let result = conn
        .lookup(&nfs3::LOOKUP3args {
            what: dirop(dir, name),
        })
        .await
        .map_err(|err| nfs_err("lookup", err))?;
    match result {
        Nfs3Result::Ok(ok) => Ok(Some(ok.object)),
        Nfs3Result::Err((nfs3::nfsstat3::NFS3ERR_NOENT, _)) => Ok(None),
        Nfs3Result::Err((code, _)) => Err(nfs_err(&format!("lookup {name}"), code)),
    }
}

async fn ensure_dir(
    conn: &mut Connection,
    parent: &nfs3::nfs_fh3,
    name: &str,
) -> Result<nfs3::nfs_fh3, CoreError> {
    if let Some(fh) = lookup(conn, parent, name).await? {
        return Ok(fh);
    }
    let result = conn
        .mkdir(&nfs3::MKDIR3args {
            where_: dirop(parent, name),
            attributes: nfs3::sattr3 {
                mode: Nfs3Option::Some(0o755),
                ..Default::default()
            },
        })
        .await
        .map_err(|err| nfs_err("mkdir", err))?;
    match result {
        Nfs3Result::Ok(ok) => {
            if let Nfs3Option::Some(fh) = ok.obj {
                return Ok(fh);
            }
        }
        // Someone else created it between our lookup and mkdir.
        Nfs3Result::Err((nfs3::nfsstat3::NFS3ERR_EXIST, _)) => {}
        Nfs3Result::Err((code, _)) => return Err(nfs_err(&format!("mkdir {name}"), code)),
    }
    lookup(conn, parent, name)
        .await?
        .ok_or_else(|| CoreError::Nfs(format!("directory {name} vanished after creation")))
}

/// Writes files to one NFS export. Each write opens a short-lived
/// connection, so there is no session to keep alive or recover.
pub struct Nfs3Writer {
    server: String,
    export_path: String,
    media_dirs: Vec<String>,
}

fn split_dirs(path: &str) -> Result<Vec<String>, CoreError> {
    path.split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .map(|part| {
            if part == ".." {
                Err(CoreError::Nfs("folder paths cannot contain '..'".into()))
            } else {
                Ok(part.to_string())
            }
        })
        .collect()
}

impl Nfs3Writer {
    pub fn new(config: &NfsShareConfig) -> Result<Self, CoreError> {
        Ok(Self {
            server: config.server.trim().to_string(),
            export_path: config.export_path.trim().to_string(),
            media_dirs: split_dirs(&config.media_path)?,
        })
    }

    /// Lists the subfolders of `path` (relative to the export root).
    pub async fn list_dirs(&self, path: &str) -> Result<Vec<String>, CoreError> {
        let dirs = split_dirs(path)?;
        with_timeout("listing folders", async {
            let mut conn = self.connect().await?;
            let result = Self::list_dirs_on(&mut conn, &dirs).await;
            let _ = conn.unmount().await;
            result
        })
        .await
    }

    async fn list_dirs_on(conn: &mut Connection, dirs: &[String]) -> Result<Vec<String>, CoreError> {
        let mut dir = conn.root_nfs_fh3();
        for name in dirs {
            dir = lookup(conn, &dir, name)
                .await?
                .ok_or_else(|| CoreError::Nfs(format!("folder {name} not found")))?;
        }

        let mut names = Vec::new();
        let mut cookie = nfs3::cookie3::default();
        let mut cookieverf = nfs3::cookieverf3::default();
        loop {
            let reply = conn
                .readdirplus(&nfs3::READDIRPLUS3args {
                    dir: dir.clone(),
                    cookie,
                    cookieverf,
                    dircount: 32 * 1024,
                    maxcount: 128 * 1024,
                })
                .await
                .map_err(|err| nfs_err("readdirplus", err))?;
            let ok = check(reply, "list folder")?;
            cookieverf = ok.cookieverf;
            let entries = ok.reply.entries.into_inner();
            for entry in &entries {
                cookie = entry.cookie;
                let name = String::from_utf8_lossy(entry.name.0.as_ref()).into_owned();
                let is_dir = matches!(
                    &entry.name_attributes,
                    Nfs3Option::Some(attrs) if attrs.type_ == nfs3::ftype3::NF3DIR
                );
                if is_dir && !name.starts_with('.') {
                    names.push(name);
                }
            }
            if ok.reply.eof || entries.is_empty() {
                break;
            }
        }
        names.sort_by_key(|name| name.to_lowercase());
        Ok(names)
    }

    async fn connect(&self) -> Result<Connection, CoreError> {
        let host = resolve_host(&self.server).await?;
        Nfs3ConnectionBuilder::new(TokioConnector, host.to_string(), &self.export_path)
            // Binding a reserved source port needs root, which the app doesn't have.
            .connect_from_privileged_port(false)
            .credential(credential())
            .mount()
            .await
            .map_err(|err| nfs_err(&format!("could not mount {}:{}", self.server, self.export_path), err))
    }

    /// Confirms the export can be mounted and that a file can be created in
    /// the media folder (creating the folder if needed).
    pub async fn test(&self) -> Result<(), CoreError> {
        with_timeout("testing the share", async {
            let mut conn = self.connect().await?;
            let result = self.probe_write(&mut conn).await;
            let _ = conn.unmount().await;
            result
        })
        .await
    }

    async fn probe_write(&self, conn: &mut Connection) -> Result<(), CoreError> {
        const PROBE: &str = ".stasher-write-test";
        let mut dir = conn.root_nfs_fh3();
        for name in &self.media_dirs {
            dir = ensure_dir(conn, &dir, name).await?;
        }
        let created = conn
            .create(&nfs3::CREATE3args {
                where_: dirop(&dir, PROBE),
                how: nfs3::createhow3::UNCHECKED(nfs3::sattr3 {
                    mode: Nfs3Option::Some(0o644),
                    ..Default::default()
                }),
            })
            .await
            .map_err(|err| nfs_err("create", err))?;
        check(created, "the server refused to create a file in the media folder")?;
        let removed = conn
            .remove(&nfs3::REMOVE3args {
                object: dirop(&dir, PROBE),
            })
            .await
            .map_err(|err| nfs_err("remove", err))?;
        check(removed, "could not remove the test file")?;
        Ok(())
    }

    async fn write_inner(&self, relative_path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
        let mut parts = self.media_dirs.clone();
        for component in relative_path.components() {
            match component {
                Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
                _ => {
                    return Err(CoreError::Nfs(format!(
                        "refusing to write outside the library: {}",
                        relative_path.display()
                    )))
                }
            }
        }
        let (file_name, dirs) = parts
            .split_last()
            .ok_or_else(|| CoreError::Nfs("empty file path".into()))?;

        let mut conn = self.connect().await?;
        let result = self.write_file_on(&mut conn, dirs, file_name, bytes).await;
        let _ = conn.unmount().await;
        result
    }

    async fn write_file_on(
        &self,
        conn: &mut Connection,
        dirs: &[String],
        file_name: &str,
        bytes: &[u8],
    ) -> Result<(), CoreError> {
        let root = conn.root_nfs_fh3();

        let chunk = match conn
            .fsinfo(&nfs3::FSINFO3args {
                fsroot: root.clone(),
            })
            .await
        {
            Ok(Nfs3Result::Ok(info)) => (info.wtpref as usize).clamp(4096, MAX_CHUNK),
            _ => DEFAULT_CHUNK,
        };

        let mut dir = root;
        for name in dirs {
            dir = ensure_dir(conn, &dir, name).await?;
        }

        let created = conn
            .create(&nfs3::CREATE3args {
                where_: dirop(&dir, file_name),
                how: nfs3::createhow3::UNCHECKED(nfs3::sattr3 {
                    mode: Nfs3Option::Some(0o644),
                    size: Nfs3Option::Some(0),
                    ..Default::default()
                }),
            })
            .await
            .map_err(|err| nfs_err("create", err))?;
        let created = check(created, &format!("create {file_name}"))?;
        let file = match created.obj {
            Nfs3Option::Some(fh) => fh,
            Nfs3Option::None => lookup(conn, &dir, file_name)
                .await?
                .ok_or_else(|| CoreError::Nfs(format!("{file_name} vanished after creation")))?,
        };

        let mut offset = 0usize;
        while offset < bytes.len() {
            let end = (offset + chunk).min(bytes.len());
            let part = &bytes[offset..end];
            let result = conn
                .write(&nfs3::WRITE3args {
                    file: file.clone(),
                    offset: offset as u64,
                    count: part.len() as u32,
                    stable: nfs3::stable_how::FILE_SYNC,
                    data: Opaque::borrowed(part),
                })
                .await
                .map_err(|err| nfs_err("write", err))?;
            let written = check(result, &format!("write {file_name}"))?.count as usize;
            if written == 0 {
                return Err(CoreError::Nfs(format!("server wrote 0 bytes of {file_name}")));
            }
            offset += written;
        }
        Ok(())
    }

    fn display_path(&self, relative_path: &Path) -> PathBuf {
        let mut path = PathBuf::from(format!("nfs://{}{}", self.server, self.export_path));
        path.extend(&self.media_dirs);
        path.join(relative_path)
    }
}

#[async_trait]
impl NfsWriter for Nfs3Writer {
    async fn write(&self, job: &StashJob, bytes: &[u8]) -> Result<PathBuf, CoreError> {
        self.write_file(Path::new(&job.id), bytes).await
    }

    async fn write_file(&self, relative_path: &Path, bytes: &[u8]) -> Result<PathBuf, CoreError> {
        with_timeout("writing to the share", self.write_inner(relative_path, bytes))
            .await
            .inspect_err(|err| tracing::error!("nfs write failed: {err}"))?;
        Ok(self.display_path(relative_path))
    }
}

/// Asks the server which paths it exports.
pub async fn list_exports(server: &str) -> Result<Vec<String>, CoreError> {
    let server = server.trim();
    if server.is_empty() {
        return Err(CoreError::Nfs("enter a server first".into()));
    }
    with_timeout("listing exports", async {
        let ip = resolve_host(server).await?;

        let stream = TcpStream::connect((ip, PMAP_PORT))
            .await
            .map_err(|err| nfs_err(&format!("could not reach {server}"), err))?;
        let mut portmapper = PortmapperClient::new(TokioIo::new(stream));
        let mount_port = portmapper
            .getport(MOUNT_PROGRAM, MOUNT_VERSION, IPPROTO_TCP)
            .await
            .map_err(|err| nfs_err("portmapper", err))?;

        let stream = TcpStream::connect((ip, mount_port))
            .await
            .map_err(|err| nfs_err("mount service", err))?;
        let mut mount = MountClient::new(TokioIo::new(stream));
        let exports = mount
            .export()
            .await
            .map_err(|err| nfs_err("export list", err))?;

        Ok(exports
            .into_inner()
            .iter()
            .map(|node| String::from_utf8_lossy(node.ex_dir.0.as_ref()).into_owned())
            .collect())
    })
    .await
}

/// Routes writes to the NFS share when one is configured, otherwise to a
/// local directory.
pub struct SwitchableWriter {
    local: LocalFsWriter,
    remote: RwLock<Option<Arc<Nfs3Writer>>>,
}

impl SwitchableWriter {
    pub fn new(local: LocalFsWriter) -> Self {
        Self {
            local,
            remote: RwLock::new(None),
        }
    }

    pub fn set_remote(&self, remote: Option<Arc<Nfs3Writer>>) {
        *self.remote.write().expect("remote writer lock poisoned") = remote;
    }

    fn remote(&self) -> Option<Arc<Nfs3Writer>> {
        self.remote.read().expect("remote writer lock poisoned").clone()
    }
}

#[async_trait]
impl NfsWriter for SwitchableWriter {
    async fn write(&self, job: &StashJob, bytes: &[u8]) -> Result<PathBuf, CoreError> {
        match self.remote() {
            Some(remote) => remote.write(job, bytes).await,
            None => self.local.write(job, bytes).await,
        }
    }

    async fn write_file(&self, relative_path: &Path, bytes: &[u8]) -> Result<PathBuf, CoreError> {
        match self.remote() {
            Some(remote) => remote.write_file(relative_path, bytes).await,
            None => self.local.write_file(relative_path, bytes).await,
        }
    }
}
