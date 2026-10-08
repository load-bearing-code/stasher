//! Domain logic shared by anything that hosts the stasher pipeline. Currently
//! only the Tauri app does, but a future headless API could reuse this crate
//! unchanged by providing its own trait implementations.

mod error;
mod fansly;
mod ffmpeg;
mod layout;
mod nfs;
mod nfs_client;
mod stash;

pub use error::CoreError;
pub use fansly::{FanslyClient, PostImage};
pub use ffmpeg::{FfmpegProcessor, NoopFfmpegProcessor};
pub use layout::{render_path, MediaName};
pub use nfs::{LocalFsWriter, NfsWriter};
pub use nfs_client::{list_exports, Nfs3Writer, SwitchableWriter};
pub use stash::{
    test_connection, ConfiguredStashClient, GraphqlStashClient, LoggingStashClient, StashClient,
};

use std::sync::{Arc, RwLock};

use stasher_protocol::{
    FileLayoutConfig, HostRequest, HostResponse, Performer, SiteProfile, StashConfig,
};

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
    /// The filename template imports name files with. Shared with the
    /// settings UI so edits take effect without a restart; `None` (or an
    /// empty template) falls back to the legacy `fansly/<id>-<n>` layout.
    pub file_layout: Arc<RwLock<Option<FileLayoutConfig>>>,
    pub fansly: Arc<FanslyClient>,
}

impl AppCore {
    fn stash_config(&self) -> Option<StashConfig> {
        self.stash_config
            .read()
            .expect("stash config lock poisoned")
            .clone()
    }

    /// The configured filename template, if one is set and non-empty.
    fn template(&self) -> Option<String> {
        self.file_layout
            .read()
            .expect("file layout lock poisoned")
            .as_ref()
            .map(|config| config.template.trim().to_string())
            .filter(|template| !template.is_empty())
    }

    /// Resolves a post's creator (by Fansly account id) to a site profile and
    /// the Stash performer it matches, if any. The profile powers the post
    /// view's creator card; the performer (matched by stored account id, then
    /// profile URL, then name) is what imported media is tied to.
    async fn resolve_creator(
        &self,
        account_id: &str,
    ) -> Result<(SiteProfile, Option<Performer>), CoreError> {
        let profile = self.fansly.fetch_account_by_id(account_id).await?;
        let performer = self.stash.find_exact_performer(&profile).await?;
        Ok((profile, performer))
    }

    /// Downloads the best-resolution copy of each image in a post, filing it
    /// under the Stash performer the post's creator maps to. The import is
    /// refused unless that performer already exists, so saved media is always
    /// tied to a Stash performer record. Returns the files written and the
    /// performer they were associated with.
    async fn import_fansly_images(
        &self,
        post_id: &str,
        auth_token: Option<&str>,
    ) -> Result<(u32, Performer), CoreError> {
        let post = self.fansly.fetch_post_import(post_id, auth_token).await?;
        if post.images.is_empty() {
            return Err(CoreError::Stash(
                "this post has no downloadable images".into(),
            ));
        }

        // Media must be associated with a Stash performer: resolve the post's
        // creator to one, and refuse the import if there's no match rather
        // than save an orphaned file.
        let account_id = post.account_id.ok_or_else(|| {
            CoreError::Stash("couldn't tell which Fansly creator this post belongs to".into())
        })?;
        let performer = self.resolve_creator(&account_id).await?.1.ok_or_else(|| {
            CoreError::Stash(
                "this creator isn't in Stash yet — import them as a performer first, \
                 then retry"
                    .into(),
            )
        })?;

        let template = self.template();
        let date = post.posted_at.map(layout::unix_to_ymd);
        let multiple = post.images.len() > 1;
        let mut written = 0;
        for (index, image) in post.images.iter().enumerate() {
            let bytes = self.fansly.download(&image.url).await?;
            let relative = self.file_path(
                post_id,
                index,
                image,
                &performer.name,
                template.as_deref(),
                post.title.as_deref(),
                date.as_deref(),
                multiple,
            );
            self.nfs.write_file(&relative, &bytes).await?;
            written += 1;
        }
        Ok((written, performer))
    }

    /// The relative path one downloaded image is written to: rendered from the
    /// template when set, otherwise the legacy `fansly/<id>-<n>.<ext>`.
    #[allow(clippy::too_many_arguments)]
    fn file_path(
        &self,
        post_id: &str,
        index: usize,
        image: &PostImage,
        performer: &str,
        template: Option<&str>,
        title: Option<&str>,
        date: Option<&str>,
        multiple: bool,
    ) -> std::path::PathBuf {
        let Some(template) = template else {
            let name = format!("{post_id}-{}.{}", index + 1, image.extension());
            return std::path::Path::new("fansly").join(name);
        };
        let name = MediaName {
            site: "fansly".into(),
            performer: Some(performer.to_string()),
            id: post_id.into(),
            title: title.map(str::to_string),
            date: date.map(str::to_string),
            resolution: (image.height > 0).then(|| format!("{}p", image.height)),
            extension: image.extension().into(),
        };
        let rendered = render_path(template, &name);
        // A template that renders to nothing (all tokens empty, no literals)
        // would write to the library root; fall back so that can't happen.
        if rendered.as_os_str().is_empty() {
            let name = format!("{post_id}-{}.{}", index + 1, image.extension());
            return std::path::Path::new("fansly").join(name);
        }
        if multiple {
            layout::with_index(&rendered, index + 1)
        } else {
            rendered
        }
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
            HostRequest::LookupPost {
                site,
                post_id,
                post_url,
            } => {
                if site != "fansly" {
                    return HostResponse::Error {
                        message: format!("unsupported site: {site}"),
                    };
                }
                let in_stash = match self.stash.post_exists(&post_url).await {
                    Ok(in_stash) => in_stash,
                    Err(err) => {
                        return HostResponse::Error {
                            message: err.to_string(),
                        }
                    }
                };
                // Resolve the post's creator so the popup can show who the
                // media would be filed under, and whether they're already a
                // Stash performer. Best-effort: a failure here just leaves the
                // creator card off rather than failing the lookup.
                let info = if in_stash {
                    None
                } else {
                    self.fansly.fetch_post(&post_id).await.ok()
                };
                let mut creator = None;
                let mut creator_in_stash = false;
                let post = match info {
                    Some(info) => {
                        if let Some(account_id) = &info.account_id {
                            if let Ok((profile, performer)) = self.resolve_creator(account_id).await
                            {
                                creator_in_stash = performer.is_some();
                                creator = Some(profile);
                            }
                        }
                        Some(info.details)
                    }
                    None => None,
                };
                HostResponse::PostLookup {
                    post_url,
                    in_stash,
                    post,
                    creator,
                    creator_in_stash,
                }
            }
            HostRequest::ImportPost {
                site,
                post_id,
                post_url,
                auth_token,
            } => {
                if site != "fansly" {
                    return HostResponse::Error {
                        message: format!("unsupported site: {site}"),
                    };
                }
                match self
                    .import_fansly_images(&post_id, auth_token.as_deref())
                    .await
                {
                    Ok((files, performer)) => HostResponse::PostImported {
                        post_url,
                        files,
                        performer,
                    },
                    Err(err) => HostResponse::Error {
                        message: err.to_string(),
                    },
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
    use wiremock::matchers::{body_string_contains, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    fn test_core() -> AppCore {
        AppCore {
            ffmpeg: Arc::new(NoopFfmpegProcessor),
            nfs: Arc::new(LocalFsWriter::new(std::env::temp_dir())),
            stash: Arc::new(LoggingStashClient),
            stash_config: Arc::new(RwLock::new(None)),
            file_layout: Arc::new(RwLock::new(None)),
            fansly: Arc::new(FanslyClient::new()),
        }
    }

    /// Mocks creator resolution on `server`: the Fansly account lookup (so the
    /// post's account id resolves to a profile) plus a `findPerformers`
    /// response (a single performer, or none to exercise the "not in Stash"
    /// gate).
    async fn mock_performer_lookup(server: &MockServer, performer: Option<(&str, &str)>) {
        mock_account(server, "acct-42", "siennakade", "Sienna Kade").await;
        let performers = match performer {
            Some((id, name)) => json!([{
                "id": id, "name": name, "urls": [],
                "image_path": null, "alias_list": [], "scene_count": 0
            }]),
            None => json!([]),
        };
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "performers": performers } }
            })))
            .mount(server)
            .await;
    }

    /// Mounts a Fansly `/api/v1/account` response so `fetch_account_by_id`
    /// resolves the post's creator.
    async fn mock_account(server: &MockServer, id: &str, username: &str, display_name: &str) {
        Mock::given(method("GET"))
            .and(path("/api/v1/account"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "success": true,
                "response": [{ "id": id, "username": username, "displayName": display_name }]
            })))
            .mount(server)
            .await;
    }

    /// An `AppCore` whose Stash client talks to `server`'s mocked GraphQL.
    fn core_with_stash(core: AppCore, server: &MockServer) -> AppCore {
        let stash_config = Arc::new(RwLock::new(Some(StashConfig {
            stash_url: server.uri(),
            api_key: "test-key".into(),
        })));
        AppCore {
            stash: Arc::new(ConfiguredStashClient::new(stash_config.clone())),
            stash_config,
            ..core
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
    async fn lookup_post_rejects_unsupported_site() {
        let core = test_core();
        let response = core
            .handle(HostRequest::LookupPost {
                site: "onlyfans".into(),
                post_id: "1".into(),
                post_url: "https://onlyfans.com/1".into(),
            })
            .await;
        match response {
            HostResponse::Error { message } => assert!(message.contains("unsupported site")),
            _ => panic!("expected Error"),
        }
    }

    #[tokio::test]
    async fn lookup_post_reports_whether_stash_has_it() {
        let stash_server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findScenes": { "count": 1 } }
            })))
            .mount(&stash_server)
            .await;

        let stash_config = Arc::new(RwLock::new(Some(StashConfig {
            stash_url: stash_server.uri(),
            api_key: "test-key".into(),
        })));
        let core = AppCore {
            stash: Arc::new(ConfiguredStashClient::new(stash_config.clone())),
            stash_config,
            ..test_core()
        };

        let response = core
            .handle(HostRequest::LookupPost {
                site: "fansly".into(),
                post_id: "42".into(),
                post_url: "https://fansly.com/post/42".into(),
            })
            .await;
        match response {
            HostResponse::PostLookup {
                post_url, in_stash, ..
            } => {
                assert_eq!(post_url, "https://fansly.com/post/42");
                assert!(in_stash);
            }
            _ => panic!("expected PostLookup"),
        }
    }

    #[tokio::test]
    async fn lookup_post_returns_the_creator_and_whether_in_stash() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "posts": [{ "accountId": "acct-42", "content": "hi", "createdAt": 1,
                                "attachments": [{ "contentId": "a" }] }],
                    "accountMedia": [{ "id": "a", "media": { "mimetype": "image/jpeg" } }]
                }
            })))
            .mount(&server)
            .await;
        mock_account(&server, "acct-42", "siennakade", "Sienna Kade").await;
        // Scene lookup: this post isn't in Stash.
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .and(body_string_contains("findScenes"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findScenes": { "count": 0 } }
            })))
            .mount(&server)
            .await;
        // Performer lookup: the creator is a known performer.
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .and(body_string_contains("findPerformers"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "performers": [{
                    "id": "1", "name": "Sienna Kade", "urls": [],
                    "image_path": null, "alias_list": [], "scene_count": 3
                }] } }
            })))
            .mount(&server)
            .await;

        let stash_config = Arc::new(RwLock::new(Some(StashConfig {
            stash_url: server.uri(),
            api_key: "test-key".into(),
        })));
        let core = AppCore {
            stash: Arc::new(ConfiguredStashClient::new(stash_config.clone())),
            stash_config,
            fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
            ..test_core()
        };

        let response = core
            .handle(HostRequest::LookupPost {
                site: "fansly".into(),
                post_id: "42".into(),
                post_url: "https://fansly.com/post/42".into(),
            })
            .await;
        match response {
            HostResponse::PostLookup {
                creator,
                creator_in_stash,
                in_stash,
                ..
            } => {
                assert!(!in_stash);
                assert!(creator_in_stash);
                let creator = creator.expect("creator resolved");
                assert_eq!(creator.username, "siennakade");
                assert_eq!(creator.display_name.as_deref(), Some("Sienna Kade"));
            }
            other => panic!("expected PostLookup, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn import_post_downloads_best_image_into_library() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .and(header("authorization", "session-token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "posts": [{ "accountId": "acct-42", "attachments": [{ "contentId": "a" }] }],
                    "accountMedia": [{
                        "id": "a",
                        "media": {
                            "mimetype": "image/jpeg", "width": 100, "height": 100,
                            "locations": [{ "location": format!("{}/cdn/small.jpg", server.uri()) }],
                            "variants": [{
                                "mimetype": "image/jpeg", "width": 4000, "height": 3000,
                                "locations": [{ "location": format!("{}/cdn/big.jpg", server.uri()) }]
                            }]
                        }
                    }]
                }
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/cdn/big.jpg"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"big-bytes".to_vec()))
            .mount(&server)
            .await;
        mock_performer_lookup(&server, Some(("1", "Sienna Kade"))).await;

        let library = tempfile::tempdir().unwrap();
        let core = core_with_stash(
            AppCore {
                nfs: Arc::new(LocalFsWriter::new(library.path())),
                fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::ImportPost {
                site: "fansly".into(),
                post_id: "42".into(),
                post_url: "https://fansly.com/post/42".into(),
                auth_token: Some("session-token".into()),
            })
            .await;
        match response {
            HostResponse::PostImported {
                files, performer, ..
            } => {
                assert_eq!(files, 1);
                assert_eq!(performer.name, "Sienna Kade");
            }
            other => panic!("expected PostImported, got {other:?}"),
        }
        let saved = std::fs::read(library.path().join("fansly/42-1.jpg")).unwrap();
        assert_eq!(saved, b"big-bytes");
    }

    #[tokio::test]
    async fn import_post_names_files_with_the_configured_template() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "posts": [{ "accountId": "acct-42", "content": "Golden hour",
                                "createdAt": 1_790_553_600,
                                "attachments": [{ "contentId": "a" }] }],
                    "accountMedia": [{
                        "id": "a",
                        "media": {
                            "mimetype": "image/jpeg", "width": 4000, "height": 2160,
                            "locations": [{ "location": format!("{}/cdn/big.jpg", server.uri()) }]
                        }
                    }]
                }
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/cdn/big.jpg"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"big-bytes".to_vec()))
            .mount(&server)
            .await;
        mock_performer_lookup(&server, Some(("1", "Sienna Kade"))).await;

        let library = tempfile::tempdir().unwrap();
        let core = core_with_stash(
            AppCore {
                nfs: Arc::new(LocalFsWriter::new(library.path())),
                file_layout: Arc::new(RwLock::new(Some(FileLayoutConfig {
                    template: "{site}/{date} – {title} [{resolution|label}].{extension}".into(),
                }))),
                fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::ImportPost {
                site: "fansly".into(),
                post_id: "42".into(),
                post_url: "https://fansly.com/post/42".into(),
                auth_token: None,
            })
            .await;
        match response {
            HostResponse::PostImported { files, .. } => assert_eq!(files, 1),
            other => panic!("expected PostImported, got {other:?}"),
        }
        let saved =
            std::fs::read(library.path().join("fansly/2026-09-28 – Golden hour [4K].jpg")).unwrap();
        assert_eq!(saved, b"big-bytes");
    }

    #[tokio::test]
    async fn import_post_files_under_the_stash_performer_name() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "posts": [{ "accountId": "acct-42", "attachments": [{ "contentId": "a" }] }],
                    "accountMedia": [{
                        "id": "a",
                        "media": {
                            "mimetype": "image/jpeg", "width": 4000, "height": 2160,
                            "locations": [{ "location": format!("{}/cdn/big.jpg", server.uri()) }]
                        }
                    }]
                }
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/cdn/big.jpg"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"big-bytes".to_vec()))
            .mount(&server)
            .await;
        // The performer's Stash name, not the Fansly account id, drives the
        // `{performer}` folder.
        mock_performer_lookup(&server, Some(("1", "Sienna Kade"))).await;

        let library = tempfile::tempdir().unwrap();
        let core = core_with_stash(
            AppCore {
                nfs: Arc::new(LocalFsWriter::new(library.path())),
                file_layout: Arc::new(RwLock::new(Some(FileLayoutConfig {
                    template: "{performer}/{id}.{extension}".into(),
                }))),
                fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::ImportPost {
                site: "fansly".into(),
                post_id: "42".into(),
                post_url: "https://fansly.com/post/42".into(),
                auth_token: None,
            })
            .await;
        assert!(matches!(response, HostResponse::PostImported { files, .. } if files == 1));
        let saved = std::fs::read(library.path().join("Sienna Kade/42.jpg")).unwrap();
        assert_eq!(saved, b"big-bytes");
    }

    #[tokio::test]
    async fn import_post_refuses_when_creator_is_not_in_stash() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "posts": [{ "accountId": "acct-unknown", "attachments": [{ "contentId": "a" }] }],
                    "accountMedia": [{
                        "id": "a",
                        "media": {
                            "mimetype": "image/jpeg", "width": 4000, "height": 2160,
                            "locations": [{ "location": format!("{}/cdn/big.jpg", server.uri()) }]
                        }
                    }]
                }
            })))
            .mount(&server)
            .await;
        // No performer matches the creator's account id.
        mock_performer_lookup(&server, None).await;

        let library = tempfile::tempdir().unwrap();
        let core = core_with_stash(
            AppCore {
                nfs: Arc::new(LocalFsWriter::new(library.path())),
                fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::ImportPost {
                site: "fansly".into(),
                post_id: "42".into(),
                post_url: "https://fansly.com/post/42".into(),
                auth_token: None,
            })
            .await;
        match response {
            HostResponse::Error { message } => assert!(message.contains("isn't in Stash")),
            other => panic!("expected Error, got {other:?}"),
        }
        // Nothing was written: the creator had no Stash performer.
        assert!(!library.path().join("fansly").exists());
    }

    #[tokio::test]
    async fn write_file_rejects_paths_outside_the_library() {
        let library = tempfile::tempdir().unwrap();
        let writer = LocalFsWriter::new(library.path());
        assert!(writer
            .write_file(std::path::Path::new("../escape.jpg"), b"x")
            .await
            .is_err());
        assert!(writer
            .write_file(std::path::Path::new("/abs.jpg"), b"x")
            .await
            .is_err());
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
            file_layout: Arc::new(RwLock::new(None)),
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
