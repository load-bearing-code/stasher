//! Domain logic shared by anything that hosts the stasher pipeline. Currently
//! only the Tauri app does, but a future headless API could reuse this crate
//! unchanged by providing its own trait implementations.

mod error;
mod fansly;
mod ffmpeg;
mod nfs;
mod stash;

pub use error::CoreError;
pub use fansly::FanslyClient;
pub use ffmpeg::{FfmpegProcessor, NoopFfmpegProcessor};
pub use nfs::{LocalFsWriter, NfsWriter};
pub use stash::{
    test_connection, ConfiguredStashClient, GraphqlStashClient, LoggingStashClient, StashClient,
};

use std::sync::{Arc, RwLock};

use stasher_protocol::{HostRequest, HostResponse, StashConfig};

/// Wires the capability traits to the protocol's request/response pair. This
/// is the one place that knows how a `HostRequest` turns into work.
pub struct AppCore {
    pub ffmpeg: Arc<dyn FfmpegProcessor>,
    pub nfs: Arc<dyn NfsWriter>,
    pub stash: Arc<dyn StashClient>,
    /// Raw Stash connection, read directly (rather than through `stash`) for
    /// `GetStatus`, which reports the configured URL and reachability
    /// independent of any specific performer operation.
    pub stash_config: Arc<RwLock<Option<StashConfig>>>,
    pub fansly: Arc<FanslyClient>,
}

impl AppCore {
    fn stash_config(&self) -> Option<StashConfig> {
        self.stash_config
            .read()
            .expect("stash config lock poisoned")
            .clone()
    }

    pub async fn handle(&self, request: HostRequest) -> HostResponse {
        match request {
            HostRequest::Ping { nonce } => HostResponse::Pong { nonce },
            HostRequest::SubmitJob { job } => match self.stash.submit_metadata(&job.metadata).await
            {
                Ok(()) => HostResponse::JobAccepted { id: job.id },
                Err(err) => HostResponse::Error {
                    message: err.to_string(),
                },
            },
            HostRequest::GetStatus => {
                let config = self.stash_config();
                let stash_reachable = match &config {
                    Some(config) => test_connection(config).await.is_ok(),
                    None => false,
                };
                HostResponse::Status {
                    stash_url: config.map(|config| config.stash_url),
                    stash_reachable,
                }
            }
            HostRequest::LookupProfile {
                site,
                username,
                profile_url,
                refresh,
            } => {
                if site != "fansly" {
                    return HostResponse::Error {
                        message: format!("unsupported site: {site}"),
                    };
                }

                let fetched = if refresh {
                    self.fansly.refresh_profile(&username, &profile_url).await
                } else {
                    self.fansly.fetch_profile(&username, &profile_url).await
                };
                let profile = match fetched {
                    Ok(profile) => profile,
                    Err(err) => {
                        return HostResponse::Error {
                            message: err.to_string(),
                        }
                    }
                };

                let exact_match = match self.stash.find_exact_performer(&profile).await {
                    Ok(exact_match) => exact_match,
                    Err(err) => {
                        return HostResponse::Error {
                            message: err.to_string(),
                        }
                    }
                };

                let exclude_id = exact_match.as_ref().map(|performer| performer.id.as_str());
                let candidates = match self
                    .stash
                    .find_performer_candidates(&profile, exclude_id)
                    .await
                {
                    Ok(candidates) => candidates,
                    Err(err) => {
                        return HostResponse::Error {
                            message: err.to_string(),
                        }
                    }
                };

                HostResponse::ProfileLookup {
                    profile,
                    exact_match,
                    candidates,
                }
            }
            HostRequest::SearchPerformers { query } => {
                match self.stash.search_performers(&query).await {
                    Ok(candidates) => HostResponse::PerformerSearch { candidates },
                    Err(err) => HostResponse::Error {
                        message: err.to_string(),
                    },
                }
            }
            HostRequest::LinkPerformer {
                performer_id,
                profile,
            } => match self.stash.link_performer(&performer_id, &profile).await {
                Ok(performer) => HostResponse::PerformerLinked { performer },
                Err(err) => HostResponse::Error {
                    message: err.to_string(),
                },
            },
            HostRequest::ImportPerformer { profile, draft } => {
                match self.stash.create_performer(&profile, &draft).await {
                    Ok(performer) => HostResponse::PerformerCreated { performer },
                    Err(err) => HostResponse::Error {
                        message: err.to_string(),
                    },
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    fn test_core() -> AppCore {
        AppCore {
            ffmpeg: Arc::new(NoopFfmpegProcessor),
            nfs: Arc::new(LocalFsWriter::new(std::env::temp_dir())),
            stash: Arc::new(LoggingStashClient),
            stash_config: Arc::new(RwLock::new(None)),
            fansly: Arc::new(FanslyClient::new()),
        }
    }

    #[tokio::test]
    async fn ping_echoes_nonce() {
        let core = test_core();
        let response = core
            .handle(HostRequest::Ping {
                nonce: "abc".into(),
            })
            .await;
        match response {
            HostResponse::Pong { nonce } => assert_eq!(nonce, "abc"),
            _ => panic!("expected Pong"),
        }
    }

    #[tokio::test]
    async fn get_status_without_config_reports_unreachable() {
        let core = test_core();
        let response = core.handle(HostRequest::GetStatus).await;
        match response {
            HostResponse::Status {
                stash_url,
                stash_reachable,
            } => {
                assert_eq!(stash_url, None);
                assert!(!stash_reachable);
            }
            _ => panic!("expected Status"),
        }
    }

    #[tokio::test]
    async fn get_status_with_config_checks_reachability() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "version": { "version": "v1.0.0" } }
            })))
            .mount(&server)
            .await;

        let mut core = test_core();
        core.stash_config = Arc::new(RwLock::new(Some(StashConfig {
            stash_url: server.uri(),
            api_key: "test-key".into(),
        })));

        let response = core.handle(HostRequest::GetStatus).await;
        match response {
            HostResponse::Status {
                stash_url,
                stash_reachable,
            } => {
                assert_eq!(stash_url.as_deref(), Some(server.uri().as_str()));
                assert!(stash_reachable);
            }
            _ => panic!("expected Status"),
        }
    }

    #[tokio::test]
    async fn lookup_profile_rejects_unsupported_site() {
        let core = test_core();
        let response = core
            .handle(HostRequest::LookupProfile {
                site: "onlyfans".into(),
                username: "someone".into(),
                profile_url: "https://onlyfans.com/someone".into(),
                refresh: false,
            })
            .await;
        match response {
            HostResponse::Error { message } => assert!(message.contains("unsupported site")),
            _ => panic!("expected Error"),
        }
    }

    #[tokio::test]
    async fn lookup_profile_finds_exact_match_end_to_end() {
        let fansly_server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "success": true,
                "response": [{
                    "id": "123",
                    "username": "WetTheFuck",
                    "displayName": "Sam and Sophie",
                    "avatar": { "locations": [{ "location": "https://cdn.example/avatar.png" }] }
                }]
            })))
            .mount(&fansly_server)
            .await;

        let stash_server = MockServer::start().await;
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
            .mount(&stash_server)
            .await;

        let stash_config = Arc::new(RwLock::new(Some(StashConfig {
            stash_url: stash_server.uri(),
            api_key: "test-key".into(),
        })));

        let core = AppCore {
            ffmpeg: Arc::new(NoopFfmpegProcessor),
            nfs: Arc::new(LocalFsWriter::new(std::env::temp_dir())),
            stash: Arc::new(ConfiguredStashClient::new(stash_config.clone())),
            stash_config,
            fansly: Arc::new(FanslyClient::with_base_url(fansly_server.uri())),
        };

        let response = core
            .handle(HostRequest::LookupProfile {
                site: "fansly".into(),
                username: "wetthefuck".into(),
                profile_url: "https://fansly.com/wetthefuck".into(),
                refresh: false,
            })
            .await;

        match response {
            HostResponse::ProfileLookup {
                profile,
                exact_match,
                candidates,
            } => {
                assert_eq!(profile.display_name.as_deref(), Some("Sam and Sophie"));
                assert_eq!(exact_match.map(|performer| performer.id), Some("1".into()));
                assert!(candidates.is_empty());
            }
            _ => panic!("expected ProfileLookup"),
        }
    }
}
