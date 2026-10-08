use async_trait::async_trait;
use stasher_protocol::StashJob;

use crate::error::CoreError;

/// Transcodes/trims/remuxes media for a job. The real implementation will
/// shell out to ffmpeg (or `ffmpeg-next`); kept behind a trait so it can be
/// swapped for a WASM-backed implementation if work ever moves client-side.
#[async_trait]
pub trait FfmpegProcessor: Send + Sync {
    async fn process(&self, job: &StashJob) -> Result<(), CoreError>;
}

/// Tracer-bullet stub: does no media processing.
pub struct NoopFfmpegProcessor;

#[async_trait]
impl FfmpegProcessor for NoopFfmpegProcessor {
    async fn process(&self, _job: &StashJob) -> Result<(), CoreError> {
        Ok(())
    }
}
