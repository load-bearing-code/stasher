use std::path::{Path, PathBuf};

use async_trait::async_trait;
use stasher_protocol::StashJob;
use tokio::fs;

use crate::error::CoreError;

/// Persists job artifacts to the stash volume. In production this base path
/// is an NFS mount; from the app's point of view it's just a directory, so
/// this implementation is real rather than a stub.
#[async_trait]
pub trait NfsWriter: Send + Sync {
    async fn write(&self, job: &StashJob, bytes: &[u8]) -> Result<PathBuf, CoreError>;

    /// Writes `bytes` to `relative_path` under the volume, creating parent
    /// directories. Rejects paths that escape the base directory.
    async fn write_file(&self, relative_path: &Path, bytes: &[u8]) -> Result<PathBuf, CoreError>;
}

pub struct LocalFsWriter {
    base_dir: PathBuf,
}

impl LocalFsWriter {
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
        }
    }
}

#[async_trait]
impl NfsWriter for LocalFsWriter {
    async fn write(&self, job: &StashJob, bytes: &[u8]) -> Result<PathBuf, CoreError> {
        fs::create_dir_all(&self.base_dir).await?;
        let path = Path::new(&self.base_dir).join(&job.id);
        fs::write(&path, bytes).await?;
        Ok(path)
    }

    async fn write_file(&self, relative_path: &Path, bytes: &[u8]) -> Result<PathBuf, CoreError> {
        let escapes = relative_path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)));
        if escapes {
            return Err(CoreError::Stash(format!(
                "refusing to write outside the library: {}",
                relative_path.display()
            )));
        }
        let path = self.base_dir.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&path, bytes).await?;
        Ok(path)
    }
}
