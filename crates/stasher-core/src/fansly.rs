//! Fetches public creator profile data from Fansly's (undocumented) account
//! API, used to show a preview before importing a performer into Stash.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use stasher_protocol::SiteProfile;

use crate::error::CoreError;

const DEFAULT_BASE_URL: &str = "https://apiv3.fansly.com";

/// Fansly's API rejects requests with no `User-Agent` (403), so send a
/// browser-like one. The value doesn't need to match a real browser version;
/// it just has to be present.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Reopening the popup repeatedly would otherwise hammer Fansly and trip 429s.
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

pub struct FanslyClient {
    http: reqwest::Client,
    base_url: String,
    cache: Mutex<HashMap<String, CachedProfile>>,
    cache_path: Option<PathBuf>,
}

impl Default for FanslyClient {
    fn default() -> Self {
        Self::new()
    }
}

impl FanslyClient {
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
        *self.cache.get_mut().expect("fansly cache lock poisoned") = loaded
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
            tracing::warn!("couldn't persist fansly profile cache: {err}");
        }
    }

    /// Looks up a Fansly account by username and maps it to a `SiteProfile`
    /// for the given profile URL (kept separate since the caller already
    /// knows the canonical URL from the browser tab).
    pub async fn fetch_profile(
        &self,
        username: &str,
        profile_url: &str,
    ) -> Result<SiteProfile, CoreError> {
        let key = username.to_lowercase();
        if let Some(entry) = self
            .cache
            .lock()
            .expect("fansly cache lock poisoned")
            .get(&key)
            .filter(|entry| entry.is_fresh())
        {
            return Ok(SiteProfile {
                profile_url: profile_url.to_string(),
                ..entry.profile.clone()
            });
        }

        let profile = self.fetch_profile_uncached(username, profile_url).await?;
        let mut cache = self.cache.lock().expect("fansly cache lock poisoned");
        cache.retain(|_, entry| entry.is_fresh());
        cache.insert(
            key,
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
        let url = format!("{}/api/v1/account", self.base_url);
        let envelope: FanslyEnvelope = self
            .http
            .get(url)
            .query(&[("usernames", username)])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let account =
            envelope.response.into_iter().next().ok_or_else(|| {
                CoreError::Stash(format!("fansly: no account named '{username}'"))
            })?;

        let photo_url = account
            .avatar
            .and_then(|avatar| avatar.locations.into_iter().next())
            .map(|location| location.location);

        Ok(SiteProfile {
            site: "fansly".into(),
            username: account.username,
            profile_url: profile_url.to_string(),
            display_name: account.display_name,
            photo_url,
            remote_id: Some(account.id),
        })
    }
}

#[derive(Debug, Deserialize)]
struct FanslyEnvelope {
    response: Vec<FanslyAccount>,
}

#[derive(Debug, Deserialize)]
struct FanslyAccount {
    id: String,
    username: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    avatar: Option<FanslyMedia>,
}

#[derive(Debug, Deserialize)]
struct FanslyMedia {
    locations: Vec<FanslyMediaLocation>,
}

#[derive(Debug, Deserialize)]
struct FanslyMediaLocation {
    location: String,
}

#[cfg(test)]
mod tests {
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    #[tokio::test]
    async fn fetch_profile_maps_account_to_site_profile() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .and(query_param("usernames", "someuser"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": [{
                    "id": "123",
                    "username": "SomeUser",
                    "displayName": "Some User",
                    "avatar": {
                        "locations": [{ "location": "https://cdn.example/avatar.png" }]
                    }
                }]
            })))
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        let profile = client
            .fetch_profile("someuser", "https://fansly.com/someuser")
            .await
            .unwrap();

        assert_eq!(profile.site, "fansly");
        assert_eq!(profile.username, "SomeUser");
        assert_eq!(profile.display_name.as_deref(), Some("Some User"));
        assert_eq!(
            profile.photo_url.as_deref(),
            Some("https://cdn.example/avatar.png")
        );
        assert_eq!(profile.remote_id.as_deref(), Some("123"));
        assert_eq!(profile.profile_url, "https://fansly.com/someuser");
    }

    #[tokio::test]
    async fn fetch_profile_caches_repeat_lookups() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": [{ "id": "123", "username": "SomeUser" }]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        for _ in 0..3 {
            client
                .fetch_profile("someuser", "https://fansly.com/someuser")
                .await
                .unwrap();
        }
    }

    #[tokio::test]
    async fn fetch_profile_cache_persists_across_clients() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": [{ "id": "123", "username": "SomeUser" }]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let dir = tempfile::tempdir().unwrap();
        let cache_file = dir.path().join("nested").join("fansly.json");

        let first = FanslyClient::with_base_url(server.uri()).with_cache_file(&cache_file);
        first
            .fetch_profile("someuser", "https://fansly.com/someuser")
            .await
            .unwrap();

        let second = FanslyClient::with_base_url(server.uri()).with_cache_file(&cache_file);
        let profile = second
            .fetch_profile("someuser", "https://fansly.com/someuser")
            .await
            .unwrap();
        assert_eq!(profile.remote_id.as_deref(), Some("123"));
    }

    #[tokio::test]
    async fn fetch_profile_errors_when_account_not_found() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": []
            })))
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        let result = client
            .fetch_profile("ghost", "https://fansly.com/ghost")
            .await;

        assert!(result.is_err());
    }
}
