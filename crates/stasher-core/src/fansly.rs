//! Fetches public creator profile data from Fansly's (undocumented) account
//! API, used to show a preview before importing a performer into Stash.

use serde::Deserialize;
use stasher_protocol::SiteProfile;

use crate::error::CoreError;

const DEFAULT_BASE_URL: &str = "https://apiv3.fansly.com";

pub struct FanslyClient {
    http: reqwest::Client,
    base_url: String,
}

impl Default for FanslyClient {
    fn default() -> Self {
        Self::new()
    }
}

impl FanslyClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: base_url.into(),
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
