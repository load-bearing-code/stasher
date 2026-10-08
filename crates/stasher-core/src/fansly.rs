//! Fetches public creator profile data from Fansly's (undocumented) account
//! API, used to show a preview before importing a performer into Stash.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use stasher_protocol::{MediaKind, PostDetails, SiteProfile};

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

        self.refresh_profile(username, profile_url).await
    }

    /// Like `fetch_profile`, but always hits Fansly and replaces whatever is
    /// cached for `username`.
    pub async fn refresh_profile(
        &self,
        username: &str,
        profile_url: &str,
    ) -> Result<SiteProfile, CoreError> {
        let profile = self.fetch_profile_uncached(username, profile_url).await?;
        let mut cache = self.cache.lock().expect("fansly cache lock poisoned");
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

    async fn fetch_post_response(
        &self,
        post_id: &str,
        auth_token: Option<&str>,
    ) -> Result<FanslyPosts, CoreError> {
        let url = format!("{}/api/v1/post", self.base_url);
        let mut request = self.http.get(url).query(&[("ids", post_id)]);
        if let Some(token) = auth_token {
            request = request.header("authorization", token);
        }
        let envelope: FanslyPostEnvelope = request
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if envelope.response.posts.is_empty() {
            return Err(CoreError::Stash(format!(
                "fansly: no post with id '{post_id}'"
            )));
        }
        Ok(envelope.response)
    }

    /// Fetches a post's caption and timestamp. The caption becomes the title.
    pub async fn fetch_post(&self, post_id: &str) -> Result<PostDetails, CoreError> {
        let FanslyPosts {
            posts,
            account_media,
            ..
        } = self.fetch_post_response(post_id, None).await?;
        let mimetypes: Vec<&str> = account_media
            .iter()
            .filter_map(|entry| entry.media.as_ref()?.mimetype.as_deref())
            .collect();
        let media_kind = if mimetypes.iter().any(|m| m.starts_with("video/")) {
            Some(MediaKind::Video)
        } else if mimetypes.iter().any(|m| m.starts_with("image/")) {
            Some(MediaKind::Image)
        } else {
            None
        };

        let post = posts.into_iter().next().expect("checked non-empty");
        let title = post
            .content
            .map(|content| content.trim().to_string())
            .filter(|content| !content.is_empty());
        Ok(PostDetails {
            title,
            posted_at: post.created_at,
            media_kind,
        })
    }

    /// The highest-resolution image for each of a post's image attachments, in
    /// attachment order. Fansly lists an original plus smaller variants per
    /// item; the largest by pixel count wins. Items with no downloadable
    /// location (e.g. locked content) are skipped. Signed CDN URLs expire, so
    /// call this right before downloading.
    pub async fn fetch_post_media(
        &self,
        post_id: &str,
        auth_token: Option<&str>,
    ) -> Result<Vec<PostImage>, CoreError> {
        let FanslyPosts {
            posts,
            account_media,
            account_media_bundles,
        } = self.fetch_post_response(post_id, auth_token).await?;
        let post = posts.into_iter().next().expect("checked non-empty");

        // An attachment's `contentId` is either a single media item or a
        // bundle of them.
        let ordered: Vec<&FanslyAccountMedia> = if post.attachments.is_empty() {
            account_media.iter().collect()
        } else {
            let ids = post.attachments.iter().flat_map(|attachment| {
                match account_media_bundles
                    .iter()
                    .find(|bundle| bundle.id == attachment.content_id)
                {
                    Some(bundle) => bundle.account_media_ids.iter().map(String::as_str).collect(),
                    None => vec![attachment.content_id.as_str()],
                }
            });
            ids.filter_map(|id| account_media.iter().find(|entry| entry.id == id))
                .collect()
        };

        let images: Vec<PostImage> = ordered
            .iter()
            .filter_map(|entry| best_image(entry.media.as_ref()?))
            .collect();
        if images.is_empty() && !ordered.is_empty() {
            return Err(CoreError::Stash(
                "this post's media is locked (subscribers or buyers only), so Fansly \
                 gave no download links"
                    .into(),
            ));
        }
        Ok(images)
    }

    pub async fn download(&self, url: &str) -> Result<Vec<u8>, CoreError> {
        let bytes = self
            .http
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        Ok(bytes.to_vec())
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

        let bio = account.about.filter(|about| !about.trim().is_empty());
        let tags = bio.as_deref().map(extract_hashtags).unwrap_or_default();
        let links = account
            .profile_socials
            .unwrap_or_default()
            .iter()
            .filter_map(social_url)
            .collect();

        Ok(SiteProfile {
            site: "fansly".into(),
            username: account.username,
            profile_url: profile_url.to_string(),
            display_name: account.display_name,
            photo_url,
            remote_id: Some(account.id),
            bio,
            location: account.location.filter(|loc| !loc.trim().is_empty()),
            links,
            tags,
        })
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

/// Fansly's social entries are undocumented, so accept any string field that
/// looks like a URL rather than committing to a field name.
fn social_url(social: &serde_json::Value) -> Option<String> {
    social
        .as_object()?
        .values()
        .filter_map(|value| value.as_str())
        .find(|value| value.starts_with("http://") || value.starts_with("https://"))
        .map(str::to_string)
}

#[derive(Debug, Deserialize)]
struct FanslyPostEnvelope {
    response: FanslyPosts,
}

#[derive(Debug, Deserialize)]
struct FanslyPosts {
    posts: Vec<FanslyPost>,
    #[serde(rename = "accountMedia", default)]
    account_media: Vec<FanslyAccountMedia>,
    #[serde(rename = "accountMediaBundles", default)]
    account_media_bundles: Vec<FanslyMediaBundle>,
}

#[derive(Debug, Deserialize)]
struct FanslyMediaBundle {
    id: String,
    #[serde(rename = "accountMediaIds", default)]
    account_media_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct FanslyAccountMedia {
    #[serde(default)]
    id: String,
    media: Option<FanslyMediaFile>,
}

#[derive(Debug, Deserialize)]
struct FanslyMediaFile {
    mimetype: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    #[serde(default)]
    locations: Vec<FanslyMediaLocation>,
    #[serde(default)]
    variants: Vec<FanslyMediaFile>,
}

#[derive(Debug, Deserialize)]
struct FanslyPost {
    content: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<u32>,
    #[serde(default)]
    attachments: Vec<FanslyAttachment>,
}

#[derive(Debug, Deserialize)]
struct FanslyAttachment {
    #[serde(rename = "contentId")]
    content_id: String,
}

/// One downloadable image, already resolved to the best available variant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PostImage {
    pub url: String,
    pub mimetype: String,
    pub width: u32,
    pub height: u32,
}

impl PostImage {
    pub fn extension(&self) -> &str {
        match self.mimetype.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            other => other.strip_prefix("image/").unwrap_or("bin"),
        }
    }
}

fn best_image(media: &FanslyMediaFile) -> Option<PostImage> {
    std::iter::once(media)
        .chain(media.variants.iter())
        .filter_map(|file| {
            let mimetype = file.mimetype.as_deref()?;
            if !mimetype.starts_with("image/") {
                return None;
            }
            let url = file.locations.first()?.location.clone();
            Some(PostImage {
                url,
                mimetype: mimetype.to_string(),
                width: file.width.unwrap_or(0),
                height: file.height.unwrap_or(0),
            })
        })
        .max_by_key(|image| u64::from(image.width) * u64::from(image.height))
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
    about: Option<String>,
    location: Option<String>,
    #[serde(rename = "profileSocials")]
    profile_socials: Option<Vec<serde_json::Value>>,
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
    async fn fetch_post_media_picks_largest_variant_in_attachment_order() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .and(query_param("ids", "42"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": {
                    "posts": [{
                        "content": "hello",
                        "createdAt": 1,
                        "attachments": [{ "contentId": "b" }, { "contentId": "a" }]
                    }],
                    "accountMedia": [
                        {
                            "id": "a",
                            "media": {
                                "mimetype": "image/jpeg", "width": 1000, "height": 1000,
                                "locations": [{ "location": "https://cdn.example/a-orig.jpg" }],
                                "variants": [{
                                    "mimetype": "image/jpeg", "width": 4000, "height": 3000,
                                    "locations": [{ "location": "https://cdn.example/a-big.jpg" }]
                                }]
                            }
                        },
                        {
                            "id": "b",
                            "media": {
                                "mimetype": "image/png", "width": 2000, "height": 2000,
                                "locations": [{ "location": "https://cdn.example/b.png" }],
                                "variants": [{
                                    "mimetype": "image/jpeg", "width": 500, "height": 500,
                                    "locations": [{ "location": "https://cdn.example/b-small.jpg" }]
                                }]
                            }
                        },
                        {
                            "id": "c",
                            "media": { "mimetype": "video/mp4", "locations": [] }
                        }
                    ]
                }
            })))
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        let images = client.fetch_post_media("42", None).await.unwrap();

        let urls: Vec<&str> = images.iter().map(|image| image.url.as_str()).collect();
        assert_eq!(
            urls,
            vec!["https://cdn.example/b.png", "https://cdn.example/a-big.jpg"]
        );
        assert_eq!(images[0].extension(), "png");
        assert_eq!(images[1].extension(), "jpg");
    }

    #[tokio::test]
    async fn fetch_post_media_expands_bundles_and_reports_locked_posts() {
        let server = MockServer::start().await;
        let body = |location: serde_json::Value| {
            serde_json::json!({
                "response": {
                    "posts": [{ "attachments": [{ "contentType": 2, "contentId": "bundle" }] }],
                    "accountMediaBundles": [{ "id": "bundle", "accountMediaIds": ["m2", "m1"] }],
                    "accountMedia": [
                        { "id": "m1", "media": { "mimetype": "image/jpeg", "width": 10, "height": 10, "locations": location } },
                        { "id": "m2", "media": { "mimetype": "image/jpeg", "width": 20, "height": 20, "locations": location } }
                    ]
                }
            })
        };
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .and(query_param("ids", "open"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body(
                serde_json::json!([{ "location": "https://cdn.example/x.jpg" }]),
            )))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .and(query_param("ids", "locked"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body(serde_json::json!([]))))
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        let images = client.fetch_post_media("open", None).await.unwrap();
        assert_eq!(images.len(), 2);
        assert_eq!(images[0].width, 20);

        let err = client.fetch_post_media("locked", None).await.unwrap_err();
        assert!(err.to_string().contains("locked"));
    }

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
    async fn fetch_profile_maps_bio_location_links_and_tags() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": [{
                    "id": "123",
                    "username": "SomeUser",
                    "about": "Hi! #Travel #travel #fitness_life",
                    "location": "Portugal",
                    "profileSocials": [
                        { "providerId": "1", "handle": "https://twitter.com/someuser" },
                        { "providerId": "2", "handle": "not-a-url" }
                    ]
                }]
            })))
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        let profile = client
            .fetch_profile("someuser", "https://fansly.com/someuser")
            .await
            .unwrap();

        assert_eq!(profile.bio.as_deref(), Some("Hi! #Travel #travel #fitness_life"));
        assert_eq!(profile.location.as_deref(), Some("Portugal"));
        assert_eq!(profile.links, vec!["https://twitter.com/someuser"]);
        assert_eq!(profile.tags, vec!["Travel", "fitness_life"]);
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
    async fn refresh_profile_bypasses_and_updates_cache() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "response": [{ "id": "123", "username": "SomeUser" }]
            })))
            .expect(2)
            .mount(&server)
            .await;

        let client = FanslyClient::with_base_url(server.uri());
        let url = "https://fansly.com/someuser";
        client.fetch_profile("someuser", url).await.unwrap();
        client.refresh_profile("someuser", url).await.unwrap();
        client.fetch_profile("someuser", url).await.unwrap();
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
