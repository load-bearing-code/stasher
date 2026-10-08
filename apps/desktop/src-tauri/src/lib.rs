mod ipc;

use std::sync::Arc;

use stasher_core::{AppCore, LocalFsWriter, LoggingStashClient, NoopFfmpegProcessor};
use stasher_protocol::{HostRequest, HostResponse};
use tauri::Manager;

#[tauri::command]
async fn ping(core: tauri::State<'_, Arc<AppCore>>, nonce: String) -> Result<HostResponse, ()> {
    Ok(core.handle(HostRequest::Ping { nonce }).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .setup(|app| {
            let stash_dir = app.path().app_local_data_dir()?.join("stash");
            let core = Arc::new(AppCore {
                ffmpeg: Arc::new(NoopFfmpegProcessor),
                nfs: Arc::new(LocalFsWriter::new(stash_dir)),
                stash: Arc::new(LoggingStashClient),
            });
            app.manage(core.clone());
            ipc::spawn_socket_server(core);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
