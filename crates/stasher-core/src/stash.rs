use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use stasher_protocol::{Performer, PerformerCandidate, SiteProfile, StashConfig, StashMetadata};

use crate::error::CoreError;

/// Writes scene metadata to Stash, and reconciles detected site profiles
/// (e.g. a Fansly page) against Stash performers.
#[async_trait]
pub trait StashClient: Send + Sync {
    /// Writes scene metadata to Stash over its GraphQL API. The real
    /// implementation needs ffmpeg-driven scene creation; stubbed for now
    /// (see `crates/stasher-core/src/ffmpeg.rs`).
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError>;

    /// Finds a confident match for `profile`: first by profile URL, then by
    /// an exact (case-insensitive) name or alias match.
    async fn find_exact_performer(
        &self,
        profile: &SiteProfile,
    ) -> Result<Option<Performer>, CoreError>;

    /// Finds performers that might be `profile` but weren't an exact match,
    /// with the reason each was suggested. `exclude_id` omits a performer
    /// already returned by `find_exact_performer`.
    async fn find_performer_candidates(
        &self,
        profile: &SiteProfile,
        exclude_id: Option<&str>,
    ) -> Result<Vec<PerformerCandidate>, CoreError>;

    /// Free-text performer search (the popup's manual "search for someone
    /// else" fallback).
    async fn search_performers(&self, query: &str) -> Result<Vec<PerformerCandidate>, CoreError>;

    /// Creates a new performer from a detected profile.
    async fn create_performer(&self, profile: &SiteProfile) -> Result<Performer, CoreError>;

    /// Attaches the profile's URL to an existing performer's URLs, preserving
    /// whatever URLs it already has, and records the profile's remote id in
    /// the performer's custom fields.
    async fn link_performer(
        &self,
        performer_id: &str,
        profile: &SiteProfile,
    ) -> Result<Performer, CoreError>;
}

/// Custom field holding the performer's Fansly account id.
const FANSLY_USER_ID_FIELD: &str = "fansly_user_id";

/// Custom fields to write for `profile`; empty when it has no Fansly id.
fn custom_fields_for(profile: &SiteProfile) -> serde_json::Map<String, Value> {
    let mut fields = serde_json::Map::new();
    if profile.site == "fansly" {
        if let Some(id) = &profile.remote_id {
            fields.insert(FANSLY_USER_ID_FIELD.into(), json!(id));
        }
    }
    fields
}

/// Builds a `GraphqlStashClient` from whatever `StashConfig` is current,
/// so `AppCore` can hold one `Arc<dyn StashClient>` for its lifetime even as
/// the user edits their Stash connection in the desktop app's settings.
pub struct ConfiguredStashClient {
    config: Arc<RwLock<Option<StashConfig>>>,
}

impl ConfiguredStashClient {
    pub fn new(config: Arc<RwLock<Option<StashConfig>>>) -> Self {
        Self { config }
    }

    fn client(&self) -> Result<GraphqlStashClient, CoreError> {
        self.config
            .read()
            .expect("stash config lock poisoned")
            .clone()
            .map(GraphqlStashClient::new)
            .ok_or_else(|| CoreError::Stash("Stash isn't configured yet".into()))
    }
}

#[async_trait]
impl StashClient for ConfiguredStashClient {
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError> {
        self.client()?.submit_metadata(metadata).await
    }

    async fn find_exact_performer(
        &self,
        profile: &SiteProfile,
    ) -> Result<Option<Performer>, CoreError> {
        self.client()?.find_exact_performer(profile).await
    }

    async fn find_performer_candidates(
        &self,
        profile: &SiteProfile,
        exclude_id: Option<&str>,
    ) -> Result<Vec<PerformerCandidate>, CoreError> {
        self.client()?
            .find_performer_candidates(profile, exclude_id)
            .await
    }

    async fn search_performers(&self, query: &str) -> Result<Vec<PerformerCandidate>, CoreError> {
        self.client()?.search_performers(query).await
    }

    async fn create_performer(&self, profile: &SiteProfile) -> Result<Performer, CoreError> {
        self.client()?.create_performer(profile).await
    }

    async fn link_performer(
        &self,
        performer_id: &str,
        profile: &SiteProfile,
    ) -> Result<Performer, CoreError> {
        self.client()?.link_performer(performer_id, profile).await
    }
}

#[derive(Debug, Deserialize)]
struct GraphqlResponse<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GraphqlError>,
}

#[derive(Debug, Deserialize)]
struct GraphqlError {
    message: String,
}

/// POSTs a GraphQL request to `<stash_url>/graphql` with the `ApiKey`
/// header, and unwraps the response into `data` or a `CoreError::Stash`
/// carrying the joined GraphQL error messages.
async fn post_graphql<T: DeserializeOwned>(
    http: &reqwest::Client,
    config: &StashConfig,
    query: &str,
    variables: Value,
) -> Result<T, CoreError> {
    let url = format!("{}/graphql", config.stash_url.trim_end_matches('/'));
    let response = http
        .post(url)
        .header("ApiKey", &config.api_key)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await?
        .error_for_status()?;

    let envelope: GraphqlResponse<T> = response.json().await?;
    if !envelope.errors.is_empty() {
        let message = envelope
            .errors
            .into_iter()
            .map(|err| err.message)
            .collect::<Vec<_>>()
            .join("; ");
        return Err(CoreError::Stash(message));
    }

    envelope
        .data
        .ok_or_else(|| CoreError::Stash("empty response".into()))
}

/// Only used to shape deserialization; the version string itself is unused
/// since `test_connection` only cares whether the request succeeded.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct VersionData {
    version: VersionInfo,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct VersionInfo {
    version: String,
}

/// Confirms a `StashConfig` points at a reachable Stash instance with a
/// valid API key, by running Stash's `version` query. Used by the desktop
/// app's "Test connection" settings action.
pub async fn test_connection(config: &StashConfig) -> Result<(), CoreError> {
    post_graphql::<VersionData>(
        &reqwest::Client::new(),
        config,
        "{ version { version } }",
        json!({}),
    )
    .await?;
    Ok(())
}

const PERFORMER_FIELDS: &str = "id name urls image_path alias_list scene_count";

#[derive(Debug, Deserialize)]
struct GqlPerformer {
    id: String,
    name: String,
    urls: Vec<String>,
    image_path: Option<String>,
    alias_list: Vec<String>,
    scene_count: i32,
}

impl From<GqlPerformer> for Performer {
    fn from(p: GqlPerformer) -> Self {
        Performer {
            id: p.id,
            name: p.name,
            urls: p.urls,
            image_path: p.image_path,
            alias_list: p.alias_list,
            scene_count: p.scene_count,
        }
    }
}

#[derive(Debug, Deserialize)]
struct FindPerformersData {
    #[serde(rename = "findPerformers")]
    find_performers: FindPerformersResult,
}

#[derive(Debug, Deserialize)]
struct FindPerformersResult {
    performers: Vec<GqlPerformer>,
}

#[derive(Debug, Deserialize)]
struct FindPerformerData {
    #[serde(rename = "findPerformer")]
    find_performer: Option<GqlPerformer>,
}

#[derive(Debug, Deserialize)]
struct PerformerCreateData {
    #[serde(rename = "performerCreate")]
    performer_create: Option<GqlPerformer>,
}

#[derive(Debug, Deserialize)]
struct PerformerUpdateData {
    #[serde(rename = "performerUpdate")]
    performer_update: Option<GqlPerformer>,
}

/// A performer name or alias counts as "similar" to the detected profile's
/// name if either normalized string contains the other. A real fuzzy-match
/// score (e.g. Levenshtein) can replace this if it proves too noisy.
fn is_name_similar(candidate_name: &str, target: &str) -> bool {
    let candidate_name = candidate_name.to_lowercase();
    let target = target.to_lowercase();
    candidate_name.contains(&target) || target.contains(&candidate_name)
}

/// Returns the first alias that partially matches `target`, for surfacing
/// "Alias 'x'" as a candidate's match reason.
fn matched_alias(aliases: &[String], target: &str) -> Option<String> {
    let target = target.to_lowercase();
    aliases
        .iter()
        .find(|alias| {
            let alias = alias.to_lowercase();
            alias.contains(&target) || target.contains(&alias)
        })
        .cloned()
}

fn candidate_from(performer: Performer, target: &str, profile_url: &str) -> PerformerCandidate {
    let shared_urls = performer.urls.iter().any(|url| url == profile_url);
    let matched_alias = matched_alias(&performer.alias_list, target);
    let name_similar = is_name_similar(&performer.name, target);
    PerformerCandidate {
        performer,
        shared_urls,
        name_similar,
        matched_alias,
    }
}

/// Real `StashClient` backed by Stash's GraphQL API
/// (`<server>:<port>/graphql`, `ApiKey` header).
pub struct GraphqlStashClient {
    http: reqwest::Client,
    config: StashConfig,
}

impl GraphqlStashClient {
    pub fn new(config: StashConfig) -> Self {
        Self {
            http: reqwest::Client::new(),
            config,
        }
    }

    async fn request<T: DeserializeOwned>(
        &self,
        query: &str,
        variables: Value,
    ) -> Result<T, CoreError> {
        post_graphql(&self.http, &self.config, query, variables).await
    }

    async fn find_by_url(&self, url: &str) -> Result<Option<Performer>, CoreError> {
        let query = format!(
            "query($performer_filter: PerformerFilterType, $filter: FindFilterType) {{ \
                findPerformers(performer_filter: $performer_filter, filter: $filter) {{ \
                    performers {{ {PERFORMER_FIELDS} }} \
                }} \
            }}"
        );
        let data: FindPerformersData = self
            .request(
                &query,
                json!({
                    "performer_filter": { "url": { "value": url, "modifier": "INCLUDES" } },
                    "filter": { "per_page": 1 },
                }),
            )
            .await?;
        Ok(data
            .find_performers
            .performers
            .into_iter()
            .next()
            .map(Performer::from))
    }

    async fn find_by_custom_fields(
        &self,
        fields: &serde_json::Map<String, Value>,
    ) -> Result<Option<Performer>, CoreError> {
        let Some((field, value)) = fields.iter().next() else {
            return Ok(None);
        };
        let query = format!(
            "query($performer_filter: PerformerFilterType, $filter: FindFilterType) {{ \
                findPerformers(performer_filter: $performer_filter, filter: $filter) {{ \
                    performers {{ {PERFORMER_FIELDS} }} \
                }} \
            }}"
        );
        let data: FindPerformersData = self
            .request(
                &query,
                json!({
                    "performer_filter": {
                        "custom_fields": [{
                            "field": field,
                            "value": [value],
                            "modifier": "EQUALS",
                        }],
                    },
                    "filter": { "per_page": 1 },
                }),
            )
            .await?;
        Ok(data
            .find_performers
            .performers
            .into_iter()
            .next()
            .map(Performer::from))
    }

    async fn find_by_name_or_alias(&self, name: &str) -> Result<Option<Performer>, CoreError> {
        let query = format!(
            "query($performer_filter: PerformerFilterType, $filter: FindFilterType) {{ \
                findPerformers(performer_filter: $performer_filter, filter: $filter) {{ \
                    performers {{ {PERFORMER_FIELDS} }} \
                }} \
            }}"
        );
        let data: FindPerformersData = self
            .request(
                &query,
                json!({
                    "performer_filter": {
                        "name": { "value": name, "modifier": "EQUALS" },
                        "OR": { "aliases": { "value": name, "modifier": "EQUALS" } },
                    },
                    "filter": { "per_page": 1 },
                }),
            )
            .await?;
        Ok(data
            .find_performers
            .performers
            .into_iter()
            .next()
            .map(Performer::from))
    }

    async fn search(&self, query_text: &str) -> Result<Vec<Performer>, CoreError> {
        let query = format!(
            "query($filter: FindFilterType) {{ \
                findPerformers(filter: $filter) {{ performers {{ {PERFORMER_FIELDS} }} }} \
            }}"
        );
        let data: FindPerformersData = self
            .request(
                &query,
                json!({ "filter": { "q": query_text, "per_page": 10 } }),
            )
            .await?;
        Ok(data
            .find_performers
            .performers
            .into_iter()
            .map(Performer::from)
            .collect())
    }

    async fn find_by_id(&self, id: &str) -> Result<Performer, CoreError> {
        let query = format!(
            "query($id: ID!) {{ findPerformer(id: $id) {{ {PERFORMER_FIELDS} }} }}"
        );
        let data: FindPerformerData = self.request(&query, json!({ "id": id })).await?;
        data.find_performer
            .map(Performer::from)
            .ok_or_else(|| CoreError::Stash(format!("performer {id} not found")))
    }
}

#[async_trait]
impl StashClient for GraphqlStashClient {
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError> {
        // Scene creation needs ffmpeg-driven file ingestion first (see
        // crates/stasher-core/src/ffmpeg.rs); log until that lands.
        tracing::info!(url = %metadata.url, title = ?metadata.title, "stash: submit_metadata (stub)");
        Ok(())
    }

    async fn find_exact_performer(
        &self,
        profile: &SiteProfile,
    ) -> Result<Option<Performer>, CoreError> {
        if let Some(performer) = self
            .find_by_custom_fields(&custom_fields_for(profile))
            .await?
        {
            return Ok(Some(performer));
        }
        if let Some(performer) = self.find_by_url(&profile.profile_url).await? {
            return Ok(Some(performer));
        }
        let target = profile.display_name.as_deref().unwrap_or(&profile.username);
        self.find_by_name_or_alias(target).await
    }

    async fn find_performer_candidates(
        &self,
        profile: &SiteProfile,
        exclude_id: Option<&str>,
    ) -> Result<Vec<PerformerCandidate>, CoreError> {
        let target = profile.display_name.as_deref().unwrap_or(&profile.username);
        let performers = self.search(target).await?;
        Ok(performers
            .into_iter()
            .filter(|performer| Some(performer.id.as_str()) != exclude_id)
            .map(|performer| candidate_from(performer, target, &profile.profile_url))
            .collect())
    }

    async fn search_performers(&self, query: &str) -> Result<Vec<PerformerCandidate>, CoreError> {
        let performers = self.search(query).await?;
        Ok(performers
            .into_iter()
            .map(|performer| candidate_from(performer, query, query))
            .collect())
    }

    async fn create_performer(&self, profile: &SiteProfile) -> Result<Performer, CoreError> {
        let name = profile
            .display_name
            .clone()
            .unwrap_or_else(|| profile.username.clone());
        let query = format!(
            "mutation($input: PerformerCreateInput!) {{ \
                performerCreate(input: $input) {{ {PERFORMER_FIELDS} }} \
            }}"
        );
        let data: PerformerCreateData = self
            .request(
                &query,
                json!({
                    "input": {
                        "name": name,
                        "urls": [profile.profile_url],
                        "image": profile.photo_url,
                        "custom_fields": custom_fields_for(profile),
                    }
                }),
            )
            .await?;
        data.performer_create
            .map(Performer::from)
            .ok_or_else(|| CoreError::Stash("performerCreate returned null".into()))
    }

    async fn link_performer(
        &self,
        performer_id: &str,
        profile: &SiteProfile,
    ) -> Result<Performer, CoreError> {
        let current = self.find_by_id(performer_id).await?;
        let mut urls = current.urls;
        if !urls.iter().any(|url| *url == profile.profile_url) {
            urls.push(profile.profile_url.clone());
        }

        let query = format!(
            "mutation($input: PerformerUpdateInput!) {{ \
                performerUpdate(input: $input) {{ {PERFORMER_FIELDS} }} \
            }}"
        );
        let data: PerformerUpdateData = self
            .request(
                &query,
                json!({ "input": {
                    "id": performer_id,
                    "urls": urls,
                    "custom_fields": { "partial": custom_fields_for(profile) },
                } }),
            )
            .await?;
        data.performer_update
            .map(Performer::from)
            .ok_or_else(|| CoreError::Stash("performerUpdate returned null".into()))
    }
}

/// Tracer-bullet stub: logs instead of calling Stash. Finders return empty
/// results; mutations return `NotImplemented` rather than fabricate IDs.
pub struct LoggingStashClient;

#[async_trait]
impl StashClient for LoggingStashClient {
    async fn submit_metadata(&self, metadata: &StashMetadata) -> Result<(), CoreError> {
        tracing::info!(url = %metadata.url, title = ?metadata.title, "stash: submit_metadata (stub)");
        Ok(())
    }

    async fn find_exact_performer(
        &self,
        profile: &SiteProfile,
    ) -> Result<Option<Performer>, CoreError> {
        tracing::info!(url = %profile.profile_url, "stash: find_exact_performer (stub)");
        Ok(None)
    }

    async fn find_performer_candidates(
        &self,
        profile: &SiteProfile,
        _exclude_id: Option<&str>,
    ) -> Result<Vec<PerformerCandidate>, CoreError> {
        tracing::info!(url = %profile.profile_url, "stash: find_performer_candidates (stub)");
        Ok(Vec::new())
    }

    async fn search_performers(&self, query: &str) -> Result<Vec<PerformerCandidate>, CoreError> {
        tracing::info!(query, "stash: search_performers (stub)");
        Ok(Vec::new())
    }

    async fn create_performer(&self, profile: &SiteProfile) -> Result<Performer, CoreError> {
        tracing::info!(url = %profile.profile_url, "stash: create_performer (stub)");
        Err(CoreError::NotImplemented("create_performer"))
    }

    async fn link_performer(
        &self,
        performer_id: &str,
        profile: &SiteProfile,
    ) -> Result<Performer, CoreError> {
        tracing::info!(performer_id, url = %profile.profile_url, "stash: link_performer (stub)");
        Err(CoreError::NotImplemented("link_performer"))
    }
}

#[cfg(test)]
mod tests {
    use wiremock::matchers::{body_partial_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    fn site_profile(profile_url: &str) -> SiteProfile {
        SiteProfile {
            site: "fansly".into(),
            username: "wetthefuck".into(),
            profile_url: profile_url.into(),
            display_name: Some("Sam and Sophie".into()),
            photo_url: Some("https://cdn.example/avatar.png".into()),
            remote_id: Some("123".into()),
        }
    }

    async fn client_for(server: &MockServer) -> GraphqlStashClient {
        GraphqlStashClient::new(StashConfig {
            stash_url: server.uri(),
            api_key: "test-key".into(),
        })
    }

    #[tokio::test]
    async fn find_exact_performer_matches_by_url() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": {
                    "findPerformers": {
                        "performers": [{
                            "id": "1",
                            "name": "Sam and Sophie",
                            "urls": ["https://fansly.com/wetthefuck"],
                            "image_path": null,
                            "alias_list": [],
                            "scene_count": 2
                        }]
                    }
                }
            })))
            .mount(&server)
            .await;

        let client = client_for(&server).await;
        let profile = site_profile("https://fansly.com/wetthefuck");
        let found = client.find_exact_performer(&profile).await.unwrap();

        assert_eq!(found.unwrap().id, "1");
    }

    #[tokio::test]
    async fn find_exact_performer_matches_by_fansly_user_id() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .and(body_partial_json(json!({
                "variables": { "performer_filter": { "custom_fields": [{
                    "field": "fansly_user_id",
                    "value": ["123"],
                    "modifier": "EQUALS",
                }] } }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "performers": [{
                    "id": "7",
                    "name": "Renamed Creator",
                    "urls": [],
                    "image_path": null,
                    "alias_list": [],
                    "scene_count": 0
                }] } }
            })))
            .mount(&server)
            .await;

        let client = client_for(&server).await;
        let profile = site_profile("https://fansly.com/wetthefuck");
        let found = client.find_exact_performer(&profile).await.unwrap();

        assert_eq!(found.unwrap().id, "7");
    }

    #[tokio::test]
    async fn find_exact_performer_returns_none_when_stash_has_no_match() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "performers": [] } }
            })))
            .mount(&server)
            .await;

        let client = client_for(&server).await;
        let profile = site_profile("https://fansly.com/wetthefuck");
        let found = client.find_exact_performer(&profile).await.unwrap();

        assert!(found.is_none());
    }

    #[tokio::test]
    async fn create_performer_sends_name_url_and_image() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": {
                    "performerCreate": {
                        "id": "99",
                        "name": "Sam and Sophie",
                        "urls": ["https://fansly.com/wetthefuck"],
                        "image_path": "https://stash.example/performer/99/image",
                        "alias_list": [],
                        "scene_count": 0
                    }
                }
            })))
            .mount(&server)
            .await;

        let client = client_for(&server).await;
        let profile = site_profile("https://fansly.com/wetthefuck");
        let performer = client.create_performer(&profile).await.unwrap();

        assert_eq!(performer.id, "99");
        assert_eq!(performer.name, "Sam and Sophie");
    }

    #[tokio::test]
    async fn graphql_errors_surface_as_core_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "errors": [{ "message": "invalid api key" }]
            })))
            .mount(&server)
            .await;

        let client = client_for(&server).await;
        let result = client
            .find_exact_performer(&site_profile("https://fansly.com/wetthefuck"))
            .await;

        assert!(matches!(result, Err(CoreError::Stash(message)) if message == "invalid api key"));
    }

    #[test]
    fn matched_alias_finds_partial_match() {
        let aliases = vec!["sample".to_string(), "other".to_string()];
        assert_eq!(
            matched_alias(&aliases, "sample_creator"),
            Some("sample".to_string())
        );
        assert_eq!(matched_alias(&aliases, "nobody"), None);
    }

    #[test]
    fn is_name_similar_matches_substrings_case_insensitively() {
        assert!(is_name_similar("Sample Kreator", "sample"));
        assert!(!is_name_similar("Totally Different", "sample"));
    }
}
