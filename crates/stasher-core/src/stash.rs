use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use stasher_protocol::{StashConfig, StashMetadata};

use crate::error::CoreError;

/// Writes scene metadata to Stash over its GraphQL API
/// (`<server>:<port>/graphql`, `ApiKey` header). The real implementation
/// needs an introspected schema + a GraphQL client; stubbed for now.
#[async_trait]
pub trait StashClient: Send + Sync {
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError>;
}

#[derive(Debug, Deserialize)]
struct GraphqlEnvelope {
    #[serde(default)]
    errors: Vec<GraphqlError>,
}

#[derive(Debug, Deserialize)]
struct GraphqlError {
    message: String,
}

/// Confirms a `StashConfig` points at a reachable Stash instance with a
/// valid API key, by running Stash's `version` query. Used by the desktop
/// app's "Test connection" settings action.
pub async fn test_connection(config: &StashConfig) -> Result<(), CoreError> {
    let url = format!("{}/graphql", config.stash_url.trim_end_matches('/'));
    let response = reqwest::Client::new()
        .post(url)
        .header("ApiKey", &config.api_key)
        .json(&json!({ "query": "{ version { version } }" }))
        .send()
        .await?
        .error_for_status()?;

    let envelope: GraphqlEnvelope = response.json().await?;
    if !envelope.errors.is_empty() {
        let message = envelope
            .errors
            .into_iter()
            .map(|err| err.message)
            .collect::<Vec<_>>()
            .join("; ");
        return Err(CoreError::Stash(message));
    }

    Ok(())
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
