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
}
