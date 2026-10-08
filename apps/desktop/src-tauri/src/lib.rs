mod config;
mod ipc;

use std::sync::{Arc, RwLock};

use stasher_core::{AppCore, ConfiguredStashClient, FanslyClient, LocalFsWriter, NoopFfmpegProcessor};
use stasher_protocol::{HostRequest, HostResponse, StashConfig};
use tauri::Manager;

/// The Stash connection the settings UI reads and writes, shared with the
/// IPC server so it can be wired into a real `StashClient` once that exists.
type SharedStashConfig = Arc<RwLock<Option<StashConfig>>>;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping,
            get_stash_config,
            set_stash_config,
            test_stash_connection
        ])
        .setup(|app| {
            let stash_dir = app.path().app_local_data_dir()?.join("stash");
            let fansly_cache = app.path().app_cache_dir()?.join("fansly-profiles.json");
            let stash_config: SharedStashConfig = Arc::new(RwLock::new(config::load(app.handle())));

            let core = Arc::new(AppCore {
                ffmpeg: Arc::new(NoopFfmpegProcessor),
                nfs: Arc::new(LocalFsWriter::new(stash_dir)),
                stash: Arc::new(ConfiguredStashClient::new(stash_config.clone())),
                stash_config: stash_config.clone(),
                fansly: Arc::new(FanslyClient::new().with_cache_file(fansly_cache)),
            });
            app.manage(core.clone());
            ipc::spawn_socket_server(core);

            app.manage(stash_config);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
