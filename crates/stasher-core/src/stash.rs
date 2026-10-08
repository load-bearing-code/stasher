use async_trait::async_trait;
use stasher_protocol::StashMetadata;

use crate::error::CoreError;

/// Writes scene metadata to Stash over its GraphQL API
/// (`<server>:<port>/graphql`, `ApiKey` header). The real implementation
/// needs an introspected schema + a GraphQL client; stubbed for now.
#[async_trait]
pub trait StashClient: Send + Sync {
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError>;
}

/// Tracer-bullet stub: logs the metadata instead of calling Stash.
pub struct LoggingStashClient;

#[async_trait]
impl StashClient for LoggingStashClient {
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError> {
        tracing::info!(url = %metadata.url, title = ?metadata.title, "stash: submit_metadata (stub)");
        Ok(())
    }
}
