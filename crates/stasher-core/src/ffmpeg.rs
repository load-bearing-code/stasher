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

/// Muxes a video-only and an audio-only file into one playable container.
/// Fansly (and DASH generally) serves video and audio as separate
/// progressive MP4 files; this is a container-level copy (no re-encoding)
/// to combine them. The real implementation shells out to an ffmpeg
/// sidecar, since this crate has no native media-processing dependencies.
#[async_trait]
pub trait VideoMuxer: Send + Sync {
    async fn mux(&self, video: &[u8], audio: &[u8]) -> Result<Vec<u8>, CoreError>;
}

/// Tracer-bullet stub: refuses to mux, so misconfiguration fails loudly
/// instead of writing a video-only (silent) file.
pub struct UnavailableVideoMuxer;

#[async_trait]
impl VideoMuxer for UnavailableVideoMuxer {
    async fn mux(&self, _video: &[u8], _audio: &[u8]) -> Result<Vec<u8>, CoreError> {
        Err(CoreError::Stash(
            "video muxing isn't available in this build".into(),
        ))
    }
}
