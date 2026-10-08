//! Muxes a Fansly video's separate video-only and audio-only MP4 tracks
//! into one playable file, by shelling out to an ffmpeg sidecar. This is a
//! container-level copy (`-c copy`): no re-encoding, so it's fast and
//! lossless.

use std::sync::atomic::{AtomicU64, Ordering};

use async_trait::async_trait;
use stasher_core::{CoreError, VideoMuxer};
use tauri_plugin_shell::ShellExt;

static NEXT_TEMP_DIR_ID: AtomicU64 = AtomicU64::new(0);

pub struct FfmpegSidecarMuxer {
    app: tauri::AppHandle,
}

impl FfmpegSidecarMuxer {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
}

#[async_trait]
impl VideoMuxer for FfmpegSidecarMuxer {
    async fn mux(&self, video: &[u8], audio: &[u8]) -> Result<Vec<u8>, CoreError> {
        let id = NEXT_TEMP_DIR_ID.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("stasher-mux-{}-{id}", std::process::id()));
        tokio::fs::create_dir_all(&dir).await?;

        let result = self.mux_in(&dir, video, audio).await;
        let _ = tokio::fs::remove_dir_all(&dir).await;
        result
    }
}

impl FfmpegSidecarMuxer {
    async fn mux_in(
        &self,
        dir: &std::path::Path,
        video: &[u8],
        audio: &[u8],
    ) -> Result<Vec<u8>, CoreError> {
        let video_path = dir.join("video.mp4");
        let output_path = dir.join("output.mp4");
        tokio::fs::write(&video_path, video).await?;

        let mut args = vec![
            "-y".to_string(),
            "-i".to_string(),
            video_path.to_string_lossy().into_owned(),
        ];
        if audio.is_empty() {
            args.push("-c".into());
            args.push("copy".into());
        } else {
            let audio_path = dir.join("audio.mp4");
            tokio::fs::write(&audio_path, audio).await?;
            args.push("-i".into());
            args.push(audio_path.to_string_lossy().into_owned());
            args.extend(
                ["-c", "copy", "-map", "0:v:0", "-map", "1:a:0"]
                    .into_iter()
                    .map(String::from),
            );
        }
        args.push(output_path.to_string_lossy().into_owned());

        let sidecar = self
            .app
            .shell()
            .sidecar("ffmpeg")
            .map_err(|err| CoreError::Stash(format!("couldn't start ffmpeg: {err}")))?;
        let output = sidecar
            .args(args)
            .output()
            .await
            .map_err(|err| CoreError::Stash(format!("couldn't run ffmpeg: {err}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(CoreError::Stash(format!(
                "ffmpeg failed to mux the video: {}",
                stderr.trim()
            )));
        }

        let muxed = tokio::fs::read(&output_path).await?;
        Ok(muxed)
    }
}
