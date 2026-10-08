mod config;
mod ipc;

use std::sync::{Arc, RwLock};

use stasher_core::{
    AppCore, ConfiguredStashClient, FanslyClient, LocalFsWriter, Nfs3Writer, NoopFfmpegProcessor,
    SwitchableWriter,
};
use stasher_protocol::{
    FileLayoutConfig, HostRequest, HostResponse, NfsExport, NfsShareConfig, StashConfig,
};
use tauri::Manager;

/// The Stash connection the settings UI reads and writes, shared with the
/// IPC server so it can be wired into a real `StashClient` once that exists.
type SharedStashConfig = Arc<RwLock<Option<StashConfig>>>;

/// The filename template the settings UI reads and writes, shared with the
/// `AppCore` so edits take effect for subsequent imports without a restart.
type SharedFileLayout = Arc<RwLock<Option<FileLayoutConfig>>>;

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
    state.config.read().expect("nfs config lock poisoned").clone()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
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
            set_file_layout
        ])
        .setup(|app| {
            let stash_dir = app.path().app_local_data_dir()?.join("stash");
            let fansly_cache = app.path().app_cache_dir()?.join("fansly-profiles.json");
            let stash_config: SharedStashConfig = Arc::new(RwLock::new(config::load(app.handle())));
            let file_layout: SharedFileLayout =
                Arc::new(RwLock::new(config::load_file_layout(app.handle())));

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
            });
            app.manage(core.clone());
            ipc::spawn_socket_server(core);

            app.manage(stash_config);
            app.manage(file_layout);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
