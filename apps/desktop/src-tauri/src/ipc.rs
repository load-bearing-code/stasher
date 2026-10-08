//! Unix-socket server `stasher-host` relays native-messaging frames into.
//! Framing matches `stasher_protocol::framing` byte-for-byte; duplicated here
//! in async form since the sync version is built on `std::io`, not tokio.

use std::sync::Arc;

use stasher_core::AppCore;
use stasher_protocol::{socket_path, HostRequest, HostResponse};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};

pub fn spawn_socket_server(core: Arc<AppCore>) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = listen(core).await {
            tracing::error!(%err, "stasher ipc server exited");
        }
    });
}

async fn listen(core: Arc<AppCore>) -> std::io::Result<()> {
    let path = socket_path();
    let _ = std::fs::remove_file(&path);
    let listener = UnixListener::bind(&path)?;
    tracing::info!(path = %path.display(), "stasher ipc listening");

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(handle_connection(stream, core.clone()));
    }
}

async fn handle_connection(mut stream: UnixStream, core: Arc<AppCore>) {
    loop {
        let request_bytes = match read_frame(&mut stream).await {
            Ok(bytes) => bytes,
            Err(_) => return,
        };

        let response = match serde_json::from_slice::<HostRequest>(&request_bytes) {
            Ok(request) => core.handle(request).await,
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
