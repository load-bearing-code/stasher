use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("not yet implemented: {0}")]
    NotImplemented(&'static str),

    #[error("stash request failed: {0}")]
    StashRequest(#[from] reqwest::Error),

    #[error("nfs error: {0}")]
    Nfs(String),

    #[error("stash error: {0}")]
    Stash(String),
}
