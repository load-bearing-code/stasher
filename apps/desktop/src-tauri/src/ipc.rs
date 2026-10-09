//! Unix-socket server `stasher-host` relays native-messaging frames into.
//! Framing matches `stasher_protocol::framing` byte-for-byte; duplicated here
//! in async form since the sync version is built on `std::io`, not tokio.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use stasher_core::AppCore;
use stasher_protocol::{socket_path, HostRequest, HostResponse};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};

/// Unix-epoch millis of the last frame received from the extension. The host
/// opens a fresh socket connection per request, so there's no long-lived
/// connection to watch; this timestamp is the signal the Sources tab turns
/// into a "connected recently" indicator. `0` means never.
pub type ExtensionLastSeen = Arc<AtomicU64>;

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn spawn_socket_server(core: Arc<AppCore>, last_seen: ExtensionLastSeen) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = listen(core, last_seen).await {
            tracing::error!(%err, "stasher ipc server exited");
        }
    });
}

async fn listen(core: Arc<AppCore>, last_seen: ExtensionLastSeen) -> std::io::Result<()> {
    let path = socket_path();
    let _ = std::fs::remove_file(&path);
    let listener = UnixListener::bind(&path)?;
    tracing::info!(path = %path.display(), "stasher ipc listening");

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(handle_connection(stream, core.clone(), last_seen.clone()));
    }
}

async fn handle_connection(
    mut stream: UnixStream,
    core: Arc<AppCore>,
    last_seen: ExtensionLastSeen,
) {
    loop {
        let request_bytes = match read_frame(&mut stream).await {
            Ok(bytes) => bytes,
            Err(_) => return,
        };
        let response = match serde_json::from_slice::<HostRequest>(&request_bytes) {
            Ok(request) => {
                last_seen.store(now_millis(), Ordering::Relaxed);
                tracing::info!(?request, "stasher ipc: received request");
                let response = core.handle(request).await;
                tracing::info!(?response, "stasher ipc: sending response");
                response
            }
            Err(err) => HostResponse::Error {
                message: format!("invalid request: {err}"),
            },
        };

        let response_bytes = serde_json::to_vec(&response).expect("HostResponse always serializes");
        if write_frame(&mut stream, &response_bytes).await.is_err() {
            return;
        }
    }
}

async fn read_frame(stream: &mut UnixStream) -> std::io::Result<Vec<u8>> {
    let mut len_bytes = [0u8; 4];
    stream.read_exact(&mut len_bytes).await?;
    let len = u32::from_ne_bytes(len_bytes) as usize;
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).await?;
    Ok(buf)
}

async fn write_frame(stream: &mut UnixStream, payload: &[u8]) -> std::io::Result<()> {
    let len = u32::try_from(payload.len())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "frame too large"))?;
    stream.write_all(&len.to_ne_bytes()).await?;
    stream.write_all(payload).await?;
    stream.flush().await
}
