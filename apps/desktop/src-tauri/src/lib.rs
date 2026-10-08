mod config;
mod ffmpeg_muxer;
mod ipc;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use ipc::ExtensionLastSeen;
use stasher_core::{
    AppCore, ConfiguredStashClient, FanslyClient, LocalFsWriter, Nfs3Writer, NoopFfmpegProcessor,
    RedgifsClient, SourceStatuses, SwitchableWriter,
};
use stasher_protocol::{
    FileLayoutConfig, HostRequest, HostResponse, NfsExport, NfsShareConfig, SourceStatus,
    SourcesConfig, StashConfig,
};
use tauri::Manager;

/// The Stash connection the settings UI reads and writes, shared with the
/// IPC server so it can be wired into a real `StashClient` once that exists.
type SharedStashConfig = Arc<RwLock<Option<StashConfig>>>;

/// The filename template the settings UI reads and writes, shared with the
/// `AppCore` so edits take effect for subsequent imports without a restart.
type SharedFileLayout = Arc<RwLock<Option<FileLayoutConfig>>>;

/// Which sources the user has turned off, read and written by the Sources tab.
type SharedSourcesConfig = Arc<RwLock<Option<SourcesConfig>>>;

/// What the Sources tab shows for the browser extension. The extension has no
/// persistent connection to watch, so this reports when we last heard from it
/// and lets the UI decide whether that's recent enough to call "connected".
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionStatus {
    last_seen_ms: Option<u64>,
}

struct NfsState {
    config: RwLock<Option<NfsShareConfig>>,
    writer: Arc<SwitchableWriter>,
}

#[tauri::command]
async fn ping(core: tauri::State<'_, Arc<AppCore>>, nonce: String) -> Result<HostResponse, ()> {
    Ok(core.handle(HostRequest::Ping { nonce }).await)
}

#[tauri::command]
fn get_stash_config(state: tauri::State<'_, SharedStashConfig>) -> Option<StashConfig> {
    state.read().expect("stash config lock poisoned").clone()
}

#[tauri::command]
fn set_stash_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedStashConfig>,
    config: StashConfig,
) -> Result<(), String> {
    config::save(&app, &config)?;
    *state.write().expect("stash config lock poisoned") = Some(config);
    Ok(())
}

#[tauri::command]
async fn test_stash_connection(config: StashConfig) -> Result<(), String> {
    stasher_core::test_connection(&config)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn get_nfs_share(state: tauri::State<'_, NfsState>) -> Option<NfsShareConfig> {
    state
        .config
        .read()
        .expect("nfs config lock poisoned")
        .clone()
}

#[tauri::command]
async fn list_nfs_exports(server: String) -> Result<Vec<NfsExport>, String> {
    stasher_core::list_exports(&server)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn list_nfs_dirs(server: String, export_path: String, path: String) -> Result<Vec<String>, String> {
    let share = NfsShareConfig {
        server,
        export_path,
        media_path: String::new(),
    };
    Nfs3Writer::new(&share)
        .map_err(|err| err.to_string())?
        .list_dirs(&path)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn connect_nfs_share(
    app: tauri::AppHandle,
    state: tauri::State<'_, NfsState>,
    config: NfsShareConfig,
) -> Result<(), String> {
    let writer = Arc::new(Nfs3Writer::new(&config).map_err(|err| err.to_string())?);
    writer.test().await.map_err(|err| err.to_string())?;
    config::save_nfs(&app, &config)?;
    state.writer.set_remote(Some(writer));
    *state.config.write().expect("nfs config lock poisoned") = Some(config);
    Ok(())
}

#[tauri::command]
fn get_file_layout(state: tauri::State<'_, SharedFileLayout>) -> Option<FileLayoutConfig> {
    state.read().expect("file layout lock poisoned").clone()
}

#[tauri::command]
fn set_file_layout(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedFileLayout>,
    config: FileLayoutConfig,
) -> Result<(), String> {
    config::save_file_layout(&app, &config)?;
    *state.write().expect("file layout lock poisoned") = Some(config);
    Ok(())
}

#[tauri::command]
fn disconnect_nfs_share(
    app: tauri::AppHandle,
    state: tauri::State<'_, NfsState>,
) -> Result<(), String> {
    state.writer.set_remote(None);
    *state.config.write().expect("nfs config lock poisoned") = None;
    config::clear_nfs(&app)
}

#[tauri::command]
fn get_sources_config(state: tauri::State<'_, SharedSourcesConfig>) -> Option<SourcesConfig> {
    state.read().expect("sources config lock poisoned").clone()
}

#[tauri::command]
fn set_sources_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedSourcesConfig>,
    core: tauri::State<'_, Arc<AppCore>>,
    config: SourcesConfig,
) -> Result<(), String> {
    let was_disabled = state
        .read()
        .expect("sources config lock poisoned")
        .as_ref()
        .is_some_and(|current| current.disabled_sites.iter().any(|site| site == "fansly"));
    let is_disabled = config.disabled_sites.iter().any(|site| site == "fansly");
    config::save_sources(&app, &config)?;
    *state.write().expect("sources config lock poisoned") = Some(config);
    if was_disabled != is_disabled {
        core.clear_source_session("fansly");
    }
    Ok(())
}

#[tauri::command]
fn get_extension_status(last_seen: tauri::State<'_, ExtensionLastSeen>) -> ExtensionStatus {
    let ms = last_seen.load(Ordering::Relaxed);
    ExtensionStatus {
        last_seen_ms: (ms != 0).then_some(ms),
    }
}

#[tauri::command]
async fn get_source_statuses(
    core: tauri::State<'_, Arc<AppCore>>,
) -> Result<Vec<SourceStatus>, String> {
    let core = core.inner().clone();
    let _ = core.refresh_source_status("fansly").await;
    let _ = core.refresh_source_status("redgifs").await;
    Ok(core.current_source_statuses())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            get_stash_config,
            set_stash_config,
            test_stash_connection,
            get_nfs_share,
            list_nfs_exports,
            list_nfs_dirs,
            connect_nfs_share,
            disconnect_nfs_share,
            get_file_layout,
            set_file_layout,
            get_sources_config,
            set_sources_config,
            get_extension_status,
            get_source_statuses
        ])
        .setup(|app| {
            let stash_dir = app.path().app_local_data_dir()?.join("stash");
            let fansly_cache = app.path().app_cache_dir()?.join("fansly-profiles.json");
            let redgifs_cache = app.path().app_cache_dir()?.join("redgifs-profiles.json");
            let stash_config: SharedStashConfig = Arc::new(RwLock::new(config::load(app.handle())));
            let file_layout: SharedFileLayout =
                Arc::new(RwLock::new(config::load_file_layout(app.handle())));
            let sources_config: SharedSourcesConfig =
                Arc::new(RwLock::new(config::load_sources(app.handle())));
            let extension_last_seen: ExtensionLastSeen = Arc::new(AtomicU64::new(0));
            let source_statuses: SourceStatuses = Arc::new(RwLock::new(Default::default()));

            let writer = Arc::new(SwitchableWriter::new(LocalFsWriter::new(stash_dir)));
            let nfs_config = config::load_nfs(app.handle());
            if let Some(share) = &nfs_config {
                match Nfs3Writer::new(share) {
                    Ok(remote) => writer.set_remote(Some(Arc::new(remote))),
                    Err(err) => tracing::warn!("ignoring saved NFS share: {err}"),
                }
            }
            app.manage(NfsState {
                config: RwLock::new(nfs_config),
                writer: writer.clone(),
            });

            let core = Arc::new(AppCore {
                ffmpeg: Arc::new(NoopFfmpegProcessor),
                nfs: writer,
                stash: Arc::new(ConfiguredStashClient::new(stash_config.clone())),
                stash_config: stash_config.clone(),
                file_layout: file_layout.clone(),
                fansly: Arc::new(FanslyClient::new().with_cache_file(fansly_cache)),
                redgifs: Arc::new(RedgifsClient::new().with_cache_file(redgifs_cache)),
                source_statuses,
                sources_config: sources_config.clone(),
                muxer: Arc::new(ffmpeg_muxer::FfmpegSidecarMuxer::new(app.handle().clone())),
            });
            app.manage(core.clone());
            ipc::spawn_socket_server(core, extension_last_seen.clone());

            app.manage(stash_config);
            app.manage(file_layout);
            app.manage(sources_config);
            app.manage(extension_last_seen);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
