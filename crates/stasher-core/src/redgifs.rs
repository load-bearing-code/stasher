//! Fetches public creator profile data from RedGifs' (semi-documented) API,
//! used to show a preview before importing a performer into Stash.
//!
//! Unlike Fansly, RedGifs profile data is fully public: there's no user
//! login/session concept, only a short-lived anonymous token the API
//! requires on every request. RedGifs also has no stable internal account
//! id, so the username itself is used as the remote identifier.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use stasher_protocol::SiteProfile;

use crate::error::CoreError;

const DEFAULT_BASE_URL: &str = "https://api.redgifs.com";

/// RedGifs' API rejects requests with no `User-Agent` (400 UserAgentNotFound),
/// so send a browser-like one. The value doesn't need to match a real browser
/// version; it just has to be present.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// RedGifs' anonymous tokens are valid for a while, but refresh well before
/// expiry so a near-expiry token doesn't get used right up to a 401.
const TOKEN_TTL: Duration = Duration::from_secs(10 * 60);

/// Reopening the popup repeatedly would otherwise hammer RedGifs.
const CACHE_TTL: Duration = Duration::from_secs(60 * 60);

#[derive(Clone, Serialize, Deserialize)]
struct CachedProfile {
    fetched_at_secs: u64,
    profile: SiteProfile,
}

impl CachedProfile {
    fn is_fresh(&self) -> bool {
        now_secs().saturating_sub(self.fetched_at_secs) < CACHE_TTL.as_secs()
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

struct CachedToken {
    token: String,
    fetched_at_secs: u64,
}

impl CachedToken {
    fn is_fresh(&self) -> bool {
        now_secs().saturating_sub(self.fetched_at_secs) < TOKEN_TTL.as_secs()
    }
}

pub struct RedgifsClient {
    http: reqwest::Client,
    base_url: String,
    token: Mutex<Option<CachedToken>>,
    cache: Mutex<HashMap<String, CachedProfile>>,
    cache_path: Option<PathBuf>,
}

impl Default for RedgifsClient {
    fn default() -> Self {
        Self::new()
    }
}

impl RedgifsClient {
    pub fn new() -> Self {
        Self::with_base_url(DEFAULT_BASE_URL)
    }

    pub(crate) fn with_base_url(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .build()
            .expect("reqwest client builds");
        Self {
            http,
            base_url: base_url.into(),
            token: Mutex::new(None),
            cache: Mutex::new(HashMap::new()),
            cache_path: None,
        }
    }

    /// Persists fetched profiles to `path` (JSON) and seeds the in-memory
    /// cache from it, so cached profiles survive app restarts.
    pub fn with_cache_file(mut self, path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let loaded: HashMap<String, CachedProfile> = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        *self.cache.get_mut().expect("redgifs cache lock poisoned") = loaded
            .into_iter()
            .filter(|(_, entry)| entry.is_fresh())
            .collect();
        self.cache_path = Some(path);
        self
    }

    fn persist(&self, snapshot: &HashMap<String, CachedProfile>) {
        let Some(path) = &self.cache_path else {
            return;
        };
        let result = (|| -> std::io::Result<()> {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(path, serde_json::to_vec(snapshot)?)
        })();
        if let Err(err) = result {
            tracing::warn!("couldn't persist redgifs profile cache: {err}");
        }
    }

    /// Returns a valid anonymous bearer token, fetching a new one if the
    /// cached token is missing or stale.
    async fn token(&self) -> Result<String, CoreError> {
        {
            let cached = self.token.lock().expect("redgifs token lock poisoned");
            if let Some(cached) = cached.as_ref().filter(|cached| cached.is_fresh()) {
                return Ok(cached.token.clone());
            }
        }

        let url = format!("{}/v2/auth/temporary", self.base_url);
        let response: RedgifsAuthResponse = self
            .http
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let mut cached = self.token.lock().expect("redgifs token lock poisoned");
        *cached = Some(CachedToken {
            token: response.token.clone(),
            fetched_at_secs: now_secs(),
        });
        Ok(response.token)
    }

    /// Looks up a RedGifs creator by username and maps them to a
    /// `SiteProfile` for the given profile URL (kept separate since the
    /// caller already knows the canonical URL from the browser tab).
    pub async fn fetch_profile(
        &self,
        username: &str,
        profile_url: &str,
    ) -> Result<SiteProfile, CoreError> {
        let key = username.to_lowercase();
        if let Some(entry) = self
            .cache
            .lock()
            .expect("redgifs cache lock poisoned")
            .get(&key)
            .filter(|entry| entry.is_fresh())
        {
            return Ok(SiteProfile {
                profile_url: profile_url.to_string(),
                ..entry.profile.clone()
            });
        }

        self.refresh_profile(username, profile_url).await
    }

    /// Like `fetch_profile`, but always hits RedGifs and replaces whatever is
    /// cached for `username`.
    pub async fn refresh_profile(
        &self,
        username: &str,
        profile_url: &str,
    ) -> Result<SiteProfile, CoreError> {
        let profile = self.fetch_profile_uncached(username, profile_url).await?;
        let mut cache = self.cache.lock().expect("redgifs cache lock poisoned");
        cache.retain(|_, entry| entry.is_fresh());
        cache.insert(
            username.to_lowercase(),
            CachedProfile {
                fetched_at_secs: now_secs(),
                profile: profile.clone(),
            },
        );
        self.persist(&cache);
        Ok(profile)
    }

    async fn fetch_profile_uncached(
        &self,
        username: &str,
        profile_url: &str,
    ) -> Result<SiteProfile, CoreError> {
        let token = self.token().await?;
        let url = format!(
            "{}/v2/users/{}/search",
            self.base_url,
            username.to_lowercase()
        );
        let response = self
            .http
            .get(url)
            .query(&[("page", "1"), ("count", "1")])
            .header("authorization", format!("Bearer {token}"))
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(CoreError::Stash(format!(
                "redgifs: no creator named '{username}'"
            )));
        }
        let envelope: RedgifsSearchResponse = response.error_for_status()?.json().await?;
        let user = envelope
            .users
            .into_iter()
            .next()
            .ok_or_else(|| CoreError::Stash(format!("redgifs: no creator named '{username}'")))?;
        Ok(user_to_profile(user, profile_url))
    }
}

/// Maps a RedGifs user onto a `SiteProfile` for `profile_url`. RedGifs has no
/// separate display name (the username is the only name shown), so
/// `display_name` is left unset.
fn user_to_profile(user: RedgifsUser, profile_url: &str) -> SiteProfile {
    let bio = user
        .description
        .as_ref()
        .filter(|bio| !bio.trim().is_empty())
        .cloned();
    let tags = bio.as_deref().map(extract_hashtags).unwrap_or_default();

    let mut links: Vec<String> = user
        .social_urls()
        .filter_map(|url| url.clone())
        .filter(|url| !url.trim().is_empty())
        .collect();
    if let Some(primary) = user.profile_url.clone().filter(|url| !url.trim().is_empty()) {
        if !links.iter().any(|existing| existing == &primary) {
            links.push(primary);
        }
    }

    SiteProfile {
        site: "redgifs".into(),
        username: user.username.clone(),
        profile_url: profile_url.to_string(),
        display_name: None,
        photo_url: user.profile_image_url.clone(),
        remote_id: Some(user.username.clone()),
        bio,
        location: None,
        links,
        tags,
    }
}

/// Hashtags in `text` without the `#`, de-duplicated case-insensitively in
/// order of first appearance.
fn extract_hashtags(text: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for word in text.split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '#')) {
        let Some(tag) = word.strip_prefix('#') else {
            continue;
        };
        if tag.is_empty() || tag.contains('#') {
            continue;
        }
        if !tags.iter().any(|existing| existing.eq_ignore_ascii_case(tag)) {
            tags.push(tag.to_string());
        }
    }
    tags
}

#[derive(Debug, Deserialize)]
struct RedgifsAuthResponse {
    token: String,
}

#[derive(Debug, Deserialize)]
struct RedgifsSearchResponse {
    #[serde(default)]
    users: Vec<RedgifsUser>,
}

/// RedGifs exposes social links as `socialUrl1`..`socialUrl18` fields rather
/// than a list.
#[derive(Debug, Default, Deserialize)]
struct RedgifsUser {
    username: String,
    #[serde(rename = "profileImageUrl")]
    profile_image_url: Option<String>,
    description: Option<String>,
    /// The creator's primary outbound link (e.g. their OnlyFans), separate
    /// from the numbered `socialUrl*` fields.
    #[serde(rename = "profileUrl")]
    profile_url: Option<String>,
    #[serde(rename = "socialUrl1")]
    social_url_1: Option<String>,
    #[serde(rename = "socialUrl2")]
    social_url_2: Option<String>,
    #[serde(rename = "socialUrl3")]
    social_url_3: Option<String>,
    #[serde(rename = "socialUrl4")]
    social_url_4: Option<String>,
    #[serde(rename = "socialUrl5")]
    social_url_5: Option<String>,
    #[serde(rename = "socialUrl6")]
    social_url_6: Option<String>,
    #[serde(rename = "socialUrl7")]
    social_url_7: Option<String>,
    #[serde(rename = "socialUrl8")]
    social_url_8: Option<String>,
    #[serde(rename = "socialUrl9")]
    social_url_9: Option<String>,
    #[serde(rename = "socialUrl10")]
    social_url_10: Option<String>,
    #[serde(rename = "socialUrl11")]
    social_url_11: Option<String>,
    #[serde(rename = "socialUrl12")]
    social_url_12: Option<String>,
    #[serde(rename = "socialUrl13")]
    social_url_13: Option<String>,
    #[serde(rename = "socialUrl14")]
    social_url_14: Option<String>,
    #[serde(rename = "socialUrl15")]
    social_url_15: Option<String>,
    #[serde(rename = "socialUrl16")]
    social_url_16: Option<String>,
    #[serde(rename = "socialUrl17")]
    social_url_17: Option<String>,
    #[serde(rename = "socialUrl18")]
    social_url_18: Option<String>,
}

impl RedgifsUser {
    fn social_urls(&self) -> impl Iterator<Item = &Option<String>> {
        [
            &self.social_url_1,
            &self.social_url_2,
            &self.social_url_3,
            &self.social_url_4,
            &self.social_url_5,
            &self.social_url_6,
            &self.social_url_7,
            &self.social_url_8,
            &self.social_url_9,
            &self.social_url_10,
            &self.social_url_11,
            &self.social_url_12,
            &self.social_url_13,
            &self.social_url_14,
            &self.social_url_15,
            &self.social_url_16,
            &self.social_url_17,
            &self.social_url_18,
        ]
        .into_iter()
    }
}

#[cfg(test)]
mod tests {
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    async fn mount_token(server: &MockServer) {
        Mock::given(method("GET"))
            .and(path("/v2/auth/temporary"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "token": "anon-token"
            })))
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn fetch_profile_maps_user_to_site_profile() {
        let server = MockServer::start().await;
        mount_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/users/someuser/search"))
            .and(query_param("page", "1"))
            .and(query_param("count", "1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "gifs": [],
                "users": [{
                    "username": "someuser",
                    "profileImageUrl": "https://userpic.redgifs.com/avatar.png",
                    "description": "Hi! #Travel #travel",
                    "profileUrl": "https://onlyfans.com/someuser",
                    "socialUrl1": "https://twitter.com/someuser",
                    "socialUrl2": "",
                    "socialUrl3": null
                }]
            })))
            .mount(&server)
            .await;

        let client = RedgifsClient::with_base_url(server.uri());
        let profile = client
            .fetch_profile("someuser", "https://www.redgifs.com/users/someuser")
            .await
            .unwrap();

        assert_eq!(profile.site, "redgifs");
        assert_eq!(profile.username, "someuser");
        assert_eq!(profile.remote_id.as_deref(), Some("someuser"));
        assert_eq!(profile.display_name, None);
        assert_eq!(
            profile.photo_url.as_deref(),
            Some("https://userpic.redgifs.com/avatar.png")
        );
        assert_eq!(profile.bio.as_deref(), Some("Hi! #Travel #travel"));
        assert_eq!(profile.tags, vec!["Travel"]);
        assert_eq!(
            profile.profile_url,
            "https://www.redgifs.com/users/someuser"
        );
        assert!(profile
            .links
            .contains(&"https://twitter.com/someuser".to_string()));
        assert!(profile
            .links
            .contains(&"https://onlyfans.com/someuser".to_string()));
        assert_eq!(profile.links.len(), 2);
    }

    #[tokio::test]
    async fn fetch_profile_errors_when_creator_not_found() {
        let server = MockServer::start().await;
        mount_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/users/ghost/search"))
            .respond_with(ResponseTemplate::new(404).set_body_json(serde_json::json!({
                "error": { "code": "HttpNotFoundException", "message": "Not found." }
            })))
            .mount(&server)
            .await;

        let client = RedgifsClient::with_base_url(server.uri());
        let result = client
            .fetch_profile("ghost", "https://www.redgifs.com/users/ghost")
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn fetch_profile_caches_repeat_lookups() {
        let server = MockServer::start().await;
        mount_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/users/someuser/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "gifs": [],
                "users": [{ "username": "someuser" }]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let client = RedgifsClient::with_base_url(server.uri());
        for _ in 0..3 {
            client
                .fetch_profile("someuser", "https://www.redgifs.com/users/someuser")
                .await
                .unwrap();
        }
    }

    #[tokio::test]
    async fn refresh_profile_bypasses_and_updates_cache() {
        let server = MockServer::start().await;
        mount_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/users/someuser/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "gifs": [],
                "users": [{ "username": "someuser" }]
            })))
            .expect(2)
            .mount(&server)
            .await;

        let client = RedgifsClient::with_base_url(server.uri());
        let url = "https://www.redgifs.com/users/someuser";
        client.fetch_profile("someuser", url).await.unwrap();
        client.refresh_profile("someuser", url).await.unwrap();
        client.fetch_profile("someuser", url).await.unwrap();
    }

    #[tokio::test]
    async fn fetch_profile_cache_persists_across_clients() {
        let server = MockServer::start().await;
        mount_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/users/someuser/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "gifs": [],
                "users": [{ "username": "someuser" }]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache_file = dir.path().join("nested").join("redgifs.json");

        let first = RedgifsClient::with_base_url(server.uri()).with_cache_file(&cache_file);
        first
            .fetch_profile("someuser", "https://www.redgifs.com/users/someuser")
            .await
            .unwrap();

        let second = RedgifsClient::with_base_url(server.uri()).with_cache_file(&cache_file);
        let profile = second
            .fetch_profile("someuser", "https://www.redgifs.com/users/someuser")
            .await
            .unwrap();
        assert_eq!(profile.remote_id.as_deref(), Some("someuser"));
    }
}
