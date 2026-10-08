//! Domain logic shared by anything that hosts the stasher pipeline. Currently
//! only the Tauri app does, but a future headless API could reuse this crate
//! unchanged by providing its own trait implementations.

mod error;
mod ffmpeg;
mod nfs;
mod stash;

pub use error::CoreError;
pub use ffmpeg::{FfmpegProcessor, NoopFfmpegProcessor};
pub use nfs::{LocalFsWriter, NfsWriter};
pub use stash::{LoggingStashClient, StashClient};

use std::sync::Arc;

use stasher_protocol::{HostRequest, HostResponse};

/// Wires the three capability traits to the protocol's request/response pair.
/// This is the one place that knows how a `HostRequest` turns into work.
pub struct AppCore {
    pub ffmpeg: Arc<dyn FfmpegProcessor>,
    pub nfs: Arc<dyn NfsWriter>,
    pub stash: Arc<dyn StashClient>,
}

impl AppCore {
    pub async fn handle(&self, request: HostRequest) -> HostResponse {
        match request {
            HostRequest::Ping { nonce } => HostResponse::Pong { nonce },
            HostRequest::SubmitJob { job } => match self.stash.submit_metadata(&job.metadata).await
            {
                Ok(()) => HostResponse::JobAccepted { id: job.id },
                Err(err) => HostResponse::Error {
                    message: err.to_string(),
                },
            },
            // TODO(step 4): wire these up to a real StashClient.
            HostRequest::GetStatus
            | HostRequest::LookupProfile { .. }
            | HostRequest::SearchPerformers { .. }
            | HostRequest::LinkPerformer { .. }
            | HostRequest::ImportPerformer { .. } => HostResponse::Error {
                message: "not yet implemented".into(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_core() -> AppCore {
        AppCore {
            ffmpeg: Arc::new(NoopFfmpegProcessor),
            nfs: Arc::new(LocalFsWriter::new(std::env::temp_dir())),
            stash: Arc::new(LoggingStashClient),
        }
    }

    #[tokio::test]
    async fn ping_echoes_nonce() {
        let core = test_core();
        let response = core
            .handle(HostRequest::Ping {
                nonce: "abc".into(),
            })
            .await;
        match response {
            HostResponse::Pong { nonce } => assert_eq!(nonce, "abc"),
            _ => panic!("expected Pong"),
        }
    }
}
