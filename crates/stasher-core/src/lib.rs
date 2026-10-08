//! Domain logic shared by anything that hosts the stasher pipeline. Currently
//! only the Tauri app does, but a future headless API could reuse this crate
//! unchanged by providing its own trait implementations.

mod error;
mod fansly;
mod ffmpeg;
mod layout;
mod nfs;
mod nfs_client;
mod redgifs;
mod stash;

pub use error::CoreError;
pub use fansly::{FanslyClient, PostImage, PostVideo};
pub use ffmpeg::{FfmpegProcessor, NoopFfmpegProcessor, UnavailableVideoMuxer, VideoMuxer};
pub use layout::{render_path, MediaName};
pub use nfs::{LocalFsWriter, NfsWriter};
pub use nfs_client::{list_exports, Nfs3Writer, SwitchableWriter};
pub use redgifs::RedgifsClient;
pub use stash::{
    test_connection, ConfiguredStashClient, GraphqlStashClient, LoggingStashClient, StashClient,
};

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use stasher_protocol::{
    FileLayoutConfig, HostRequest, HostResponse, Performer, SiteProfile, SourceAccount,
    SourceSessionState, SourceStatus, SourcesConfig, StashConfig,
};

/// Sanitized, runtime-only status reported by browser sources. This state is
/// shared with the desktop UI but is never written to configuration files.
pub type SourceStatuses = Arc<RwLock<HashMap<String, SourceStatus>>>;

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
    pub redgifs: Arc<RedgifsClient>,
    pub source_statuses: SourceStatuses,
    pub sources_config: Arc<RwLock<Option<SourcesConfig>>>,
    /// Muxes a Fansly video's separate video/audio tracks into one file.
    pub muxer: Arc<dyn VideoMuxer>,
}

impl AppCore {
    fn now_millis() -> f64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as f64)
            .unwrap_or(0.0)
    }

    fn empty_source_status(site: &str) -> SourceStatus {
        SourceStatus {
            site: site.to_string(),
            session_state: SourceSessionState::Unknown,
            account: None,
            performers_synced: None,
            session_checked_at_ms: None,
        }
    }

    fn source_host(site: &str) -> Option<&'static str> {
        match site {
            "fansly" => Some("https://fansly.com/"),
            "redgifs" => Some("https://www.redgifs.com/"),
            _ => None,
        }
    }

    fn sources_config(&self) -> SourcesConfig {
        self.sources_config
            .read()
            .expect("sources config lock poisoned")
            .clone()
            .unwrap_or_default()
    }

    fn source_enabled(&self, site: &str) -> bool {
        !self
            .sources_config()
            .disabled_sites
            .iter()
            .any(|disabled| disabled == site)
    }

    pub fn current_source_statuses(&self) -> Vec<SourceStatus> {
        self.source_statuses
            .read()
            .expect("source statuses lock poisoned")
            .values()
            .cloned()
            .collect()
    }

    pub fn clear_source_session(&self, site: &str) {
        let mut statuses = self
            .source_statuses
            .write()
            .expect("source statuses lock poisoned");
        let status = statuses
            .entry(site.to_string())
            .or_insert_with(|| Self::empty_source_status(site));
        status.session_state = SourceSessionState::Unknown;
        status.account = None;
        status.session_checked_at_ms = None;
    }

    /// Refreshes the Stash performer count without changing browser session
    /// state. Count failures remain `None`, never a fabricated zero.
    pub async fn refresh_source_status(&self, site: &str) -> Result<SourceStatus, CoreError> {
        let host = Self::source_host(site)
            .ok_or_else(|| CoreError::Stash(format!("unsupported site: {site}")))?;
        let performers_synced = self.stash.count_performers_by_url(host).await.ok();
        let mut statuses = self
            .source_statuses
            .write()
            .expect("source statuses lock poisoned");
        let status = statuses
            .entry(site.to_string())
            .or_insert_with(|| Self::empty_source_status(site));
        status.performers_synced = performers_synced;
        Ok(status.clone())
    }

    async fn report_source_status(
        &self,
        site: &str,
        reported_state: SourceSessionState,
        auth_token: Option<String>,
    ) -> Result<SourceStatus, CoreError> {
        Self::source_host(site)
            .ok_or_else(|| CoreError::Stash(format!("unsupported site: {site}")))?;
        if !self.source_enabled(site) {
            return Err(CoreError::Stash(format!("source is disabled: {site}")));
        }

        let (session_state, account) = match (reported_state, auth_token) {
            (SourceSessionState::Unknown, _) => (SourceSessionState::Unknown, None),
            (SourceSessionState::SignedOut, _) => (SourceSessionState::SignedOut, None),
            (SourceSessionState::SignedIn, Some(token)) => {
                match self.fansly.fetch_authenticated_account(&token).await {
                    Ok(Some(profile)) => (
                        SourceSessionState::SignedIn,
                        Some(SourceAccount {
                            id: profile.remote_id.unwrap_or_default(),
                            username: profile.username,
                            display_name: profile.display_name,
                        }),
                    ),
                    Ok(None) => (SourceSessionState::SignedOut, None),
                    Err(_) => (SourceSessionState::Unknown, None),
                }
            }
            (SourceSessionState::SignedIn, None) => (SourceSessionState::Unknown, None),
        };

        {
            let mut statuses = self
                .source_statuses
                .write()
                .expect("source statuses lock poisoned");
            let status = statuses
                .entry(site.to_string())
                .or_insert_with(|| Self::empty_source_status(site));
            status.session_state = session_state;
            status.account = account;
            status.session_checked_at_ms = Some(Self::now_millis());
        }
        self.refresh_source_status(site).await
    }

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

    /// Downloads the best-resolution copy of each image and video in a post,
    /// filing them under the Stash performer the post's creator maps to.
    /// Videos are muxed from Fansly's separate video/audio tracks before
    /// being written. The import is refused unless that performer already
    /// exists, so saved media is always tied to a Stash performer record.
    /// Returns the files written and the performer they were associated
    /// with.
    async fn import_fansly_post(
        &self,
        post_id: &str,
        auth_token: Option<&str>,
    ) -> Result<(u32, Performer), CoreError> {
        let post = self.fansly.fetch_post_import(post_id, auth_token).await?;
        if post.images.is_empty() && post.videos.is_empty() {
            return Err(CoreError::Stash(
                "this post has no downloadable images or video".into(),
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
        let multiple = post.images.len() + post.videos.len() > 1;
        let mut written = 0;
        for (index, image) in post.images.iter().enumerate() {
            let bytes = self.fansly.download(&image.url).await?;
            let relative = self.file_path(
                "fansly",
                post_id,
                index,
                image.extension(),
                image.height,
                &performer.name,
                template.as_deref(),
                post.title.as_deref(),
                date.as_deref(),
                multiple,
            );
            self.nfs.write_file(&relative, &bytes).await?;
            written += 1;
        }
        for (index, video) in post.videos.iter().enumerate() {
            let video_bytes = self
                .fansly
                .download_track(&video.video_url, &video.cookie_header)
                .await?;
            let audio_bytes = match &video.audio_url {
                Some(url) => self.fansly.download_track(url, &video.cookie_header).await?,
                None => Vec::new(),
            };
            let muxed = self.muxer.mux(&video_bytes, &audio_bytes).await?;
            let relative = self.file_path(
                "fansly",
                post_id,
                post.images.len() + index,
                video.extension(),
                video.height,
                &performer.name,
                template.as_deref(),
                post.title.as_deref(),
                date.as_deref(),
                multiple,
            );
            self.nfs.write_file(&relative, &muxed).await?;
            written += 1;
        }
        Ok((written, performer))
    }

    /// Downloads a RedGifs post's video, filing it under the Stash performer
    /// its creator maps to. Like Fansly imports, this is refused unless that
    /// performer already exists.
    async fn import_redgifs_video(&self, post_id: &str) -> Result<(u32, Performer), CoreError> {
        let info = self.redgifs.fetch_post(post_id).await?;
        let url = info
            .download_url
            .ok_or_else(|| CoreError::Stash("this post has no downloadable video".into()))?;
        let creator = info.creator.ok_or_else(|| {
            CoreError::Stash("couldn't tell which RedGifs creator this post belongs to".into())
        })?;
        let performer = self
            .stash
            .find_exact_performer(&creator)
            .await?
            .ok_or_else(|| {
                CoreError::Stash(
                    "this creator isn't in Stash yet — import them as a performer first, \
                     then retry"
                        .into(),
                )
            })?;

        let bytes = self.redgifs.download(&url).await?;
        let template = self.template();
        let date = info.details.posted_at.map(layout::unix_to_ymd);
        let relative = self.file_path(
            "redgifs",
            post_id,
            0,
            &info.extension,
            info.height,
            &performer.name,
            template.as_deref(),
            info.details.title.as_deref(),
            date.as_deref(),
            false,
        );
        self.nfs.write_file(&relative, &bytes).await?;
        Ok((1, performer))
    }

    /// The relative path one downloaded file is written to: rendered from the
    /// template when set, otherwise the legacy `<site>/<id>-<n>.<ext>`.
    #[allow(clippy::too_many_arguments)]
    fn file_path(
        &self,
        site: &str,
        post_id: &str,
        index: usize,
        extension: &str,
        height: u32,
        performer: &str,
        template: Option<&str>,
        title: Option<&str>,
        date: Option<&str>,
        multiple: bool,
    ) -> std::path::PathBuf {
        let Some(template) = template else {
            let name = format!("{post_id}-{}.{extension}", index + 1);
            return std::path::Path::new(site).join(name);
        };
        let name = MediaName {
            site: site.into(),
            performer: Some(performer.to_string()),
            id: post_id.into(),
            title: title.map(str::to_string),
            date: date.map(str::to_string),
            resolution: (height > 0).then(|| format!("{height}p")),
            extension: extension.into(),
        };
        let rendered = render_path(template, &name);
        // A template that renders to nothing (all tokens empty, no literals)
        // would write to the library root; fall back so that can't happen.
        if rendered.as_os_str().is_empty() {
            let name = format!("{post_id}-{}.{extension}", index + 1);
            return std::path::Path::new(site).join(name);
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
            HostRequest::GetSourcesConfig => HostResponse::SourcesConfig {
                config: self.sources_config(),
            },
            HostRequest::ReportSourceStatus {
                site,
                session_state,
                auth_token,
            } => {
                match self
                    .report_source_status(&site, session_state, auth_token)
                    .await
                {
                    Ok(status) => HostResponse::SourceStatusReported { status },
                    Err(err) => HostResponse::Error {
                        message: err.to_string(),
                    },
                }
            }
            HostRequest::LookupProfile {
                site,
                username,
                profile_url,
                refresh,
            } => {
                let fetched = match site.as_str() {
                    "fansly" if refresh => {
                        self.fansly.refresh_profile(&username, &profile_url).await
                    }
                    "fansly" => self.fansly.fetch_profile(&username, &profile_url).await,
                    "redgifs" if refresh => {
                        self.redgifs.refresh_profile(&username, &profile_url).await
                    }
                    "redgifs" => self.redgifs.fetch_profile(&username, &profile_url).await,
                    _ => {
                        return HostResponse::Error {
                            message: format!("unsupported site: {site}"),
                        };
                    }
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
                if site != "fansly" && site != "redgifs" {
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
                let (post, creator) = if in_stash {
                    (None, None)
                } else {
                    match site.as_str() {
                        "fansly" => match self.fansly.fetch_post(&post_id).await {
                            Ok(info) => {
                                let creator = match &info.account_id {
                                    Some(account_id) => self
                                        .resolve_creator(account_id)
                                        .await
                                        .ok()
                                        .map(|(profile, _)| profile),
                                    None => None,
                                };
                                (Some(info.details), creator)
                            }
                            Err(_) => (None, None),
                        },
                        "redgifs" => match self.redgifs.fetch_post(&post_id).await {
                            Ok(info) => (Some(info.details), info.creator),
                            Err(_) => (None, None),
                        },
                        _ => unreachable!("checked above"),
                    }
                };
                let creator_in_stash = match &creator {
                    Some(profile) => matches!(
                        self.stash.find_exact_performer(profile).await,
                        Ok(Some(_))
                    ),
                    None => false,
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
                let imported = match site.as_str() {
                    "fansly" => self.import_fansly_post(&post_id, auth_token.as_deref()).await,
                    "redgifs" => self.import_redgifs_video(&post_id).await,
                    _ => {
                        return HostResponse::Error {
                            message: format!("unsupported site: {site}"),
                        };
                    }
                };
                match imported {
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
    use stasher_protocol::MediaKind;
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
            redgifs: Arc::new(RedgifsClient::new()),
            source_statuses: Arc::new(RwLock::new(HashMap::new())),
            sources_config: Arc::new(RwLock::new(None)),
            muxer: Arc::new(FakeMuxer),
        }
    }

    /// Mux stand-in for tests: concatenates the two inputs with a marker, so
    /// tests can assert both tracks reached the muxer without needing real
    /// ffmpeg.
    struct FakeMuxer;

    #[async_trait::async_trait]
    impl VideoMuxer for FakeMuxer {
        async fn mux(&self, video: &[u8], audio: &[u8]) -> Result<Vec<u8>, CoreError> {
            let mut muxed = video.to_vec();
            muxed.extend_from_slice(b"|AUDIO:");
            muxed.extend_from_slice(audio);
            Ok(muxed)
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
    async fn report_source_status_resolves_account_and_synced_performers() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account/me"))
            .and(header("authorization", "session-token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": { "account": {
                    "id": "acct-42",
                    "username": "siennakade",
                    "displayName": "Sienna Kade"
                } }
            })))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .and(body_string_contains("findPerformers"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "count": 14 } }
            })))
            .mount(&server)
            .await;

        let core = core_with_stash(
            AppCore {
                fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );
        let response = core
            .handle(HostRequest::ReportSourceStatus {
                site: "fansly".into(),
                session_state: SourceSessionState::SignedIn,
                auth_token: Some("session-token".into()),
            })
            .await;

        match &response {
            HostResponse::SourceStatusReported { status } => {
                assert_eq!(status.session_state, SourceSessionState::SignedIn);
                assert_eq!(status.account.as_ref().unwrap().username, "siennakade");
                assert_eq!(status.performers_synced, Some(14));
                assert!(status.session_checked_at_ms.is_some());
            }
            other => panic!("expected SourceStatusReported, got {other:?}"),
        }
        assert!(!serde_json::to_string(&response)
            .unwrap()
            .contains("session-token"));
        assert_eq!(core.current_source_statuses().len(), 1);
    }

    #[tokio::test]
    async fn report_source_status_distinguishes_signed_out_from_lookup_failure() {
        let signed_out = test_core();
        let response = signed_out
            .handle(HostRequest::ReportSourceStatus {
                site: "fansly".into(),
                session_state: SourceSessionState::SignedOut,
                auth_token: None,
            })
            .await;
        assert!(matches!(
            response,
            HostResponse::SourceStatusReported {
                status: SourceStatus {
                    session_state: SourceSessionState::SignedOut,
                    ..
                }
            }
        ));

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/account/me"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;
        let unavailable = AppCore {
            fansly: Arc::new(FanslyClient::with_base_url(server.uri())),
            ..test_core()
        };
        let response = unavailable
            .handle(HostRequest::ReportSourceStatus {
                site: "fansly".into(),
                session_state: SourceSessionState::SignedIn,
                auth_token: Some("session-token".into()),
            })
            .await;
        assert!(matches!(
            response,
            HostResponse::SourceStatusReported {
                status: SourceStatus {
                    session_state: SourceSessionState::Unknown,
                    ..
                }
            }
        ));
    }

    #[tokio::test]
    async fn report_source_status_rejects_disabled_sources() {
        let core = AppCore {
            sources_config: Arc::new(RwLock::new(Some(SourcesConfig {
                disabled_sites: vec!["fansly".into()],
            }))),
            ..test_core()
        };
        let response = core
            .handle(HostRequest::ReportSourceStatus {
                site: "fansly".into(),
                session_state: SourceSessionState::SignedIn,
                auth_token: Some("must-not-be-used".into()),
            })
            .await;

        assert!(matches!(
            response,
            HostResponse::Error { message } if message.contains("disabled")
        ));
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
    async fn import_post_downloads_and_muxes_a_fansly_video() {
        let server = MockServer::start().await;
        let mpd_url = format!("{}/new/963222022433820673.mpd", server.uri());
        Mock::given(method("GET"))
            .and(path("/api/v1/post"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "posts": [{ "accountId": "acct-42", "attachments": [{ "contentId": "a" }] }],
                    "accountMedia": [{
                        "id": "a",
                        "media": {
                            "mimetype": "video/mp4", "width": 720, "height": 1100,
                            "locations": [],
                            "variants": [{
                                "mimetype": "application/dash+xml", "width": 2160, "height": 3298,
                                "locations": [{
                                    "location": mpd_url,
                                    "metadata": {
                                        "Key-Pair-Id": "KEY123",
                                        "Policy": "policy-token",
                                        "Signature": "sig-token"
                                    }
                                }]
                            }]
                        }
                    }]
                }
            })))
            .mount(&server)
            .await;
        let cookie = "CloudFront-Key-Pair-Id=KEY123; CloudFront-Policy=policy-token; \
                       CloudFront-Signature=sig-token";
        Mock::given(method("GET"))
            .and(path("/new/963222022433820673.mpd"))
            .and(header("cookie", cookie))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<?xml version="1.0" ?>
                <MPD>
                  <Period>
                    <AdaptationSet mimeType="video/mp4">
                      <Representation bandwidth="7993408" width="2160" height="3298">
                        <BaseURL>video.mp4</BaseURL>
                      </Representation>
                    </AdaptationSet>
                    <AdaptationSet mimeType="audio/mp4">
                      <Representation bandwidth="387195">
                        <BaseURL>audio.mp4</BaseURL>
                      </Representation>
                    </AdaptationSet>
                  </Period>
                </MPD>"#,
            ))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/new/video.mp4"))
            .and(header("cookie", cookie))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"video-bytes".to_vec()))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/new/audio.mp4"))
            .and(header("cookie", cookie))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"audio-bytes".to_vec()))
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
                auth_token: None,
            })
            .await;
        match response {
            HostResponse::PostImported { files, .. } => assert_eq!(files, 1),
            other => panic!("expected PostImported, got {other:?}"),
        }
        // `FakeMuxer` concatenates its inputs with a marker, so this proves
        // both tracks were downloaded and handed to the muxer before the
        // result was written.
        let saved = std::fs::read(library.path().join("fansly/42-1.mp4")).unwrap();
        assert_eq!(saved, b"video-bytes|AUDIO:audio-bytes");
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
            redgifs: Arc::new(RedgifsClient::new()),
            source_statuses: Arc::new(RwLock::new(HashMap::new())),
            sources_config: Arc::new(RwLock::new(None)),
            muxer: Arc::new(FakeMuxer),
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

    #[tokio::test]
    async fn lookup_profile_dispatches_to_redgifs() {
        let redgifs_server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v2/auth/temporary"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "token": "anon-token"
            })))
            .mount(&redgifs_server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v2/users/someuser/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "gifs": [],
                "users": [{ "username": "someuser" }]
            })))
            .mount(&redgifs_server)
            .await;

        let core = AppCore {
            redgifs: Arc::new(RedgifsClient::with_base_url(redgifs_server.uri())),
            ..test_core()
        };

        let response = core
            .handle(HostRequest::LookupProfile {
                site: "redgifs".into(),
                username: "someuser".into(),
                profile_url: "https://www.redgifs.com/users/someuser".into(),
                refresh: false,
            })
            .await;

        match response {
            HostResponse::ProfileLookup { profile, .. } => {
                assert_eq!(profile.site, "redgifs");
                assert_eq!(profile.remote_id.as_deref(), Some("someuser"));
            }
            other => panic!("expected ProfileLookup, got {other:?}"),
        }
    }

    /// Mounts a RedGifs `/v2/auth/temporary` response so any RedGifs API
    /// call on `server` can obtain its anonymous bearer token.
    async fn mock_redgifs_token(server: &MockServer) {
        Mock::given(method("GET"))
            .and(path("/v2/auth/temporary"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "token": "anon-token"
            })))
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn lookup_post_dispatches_to_redgifs() {
        let server = MockServer::start().await;
        mock_redgifs_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/gifs/abc123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "gif": {
                    "id": "abc123",
                    "description": "Having fun in the sun",
                    "createDate": 1_700_000_000,
                    "type": 1,
                    "height": 1080,
                    "urls": { "hd": format!("{}/media/abc123.mp4", server.uri()) },
                    "userName": "someuser"
                },
                "user": { "username": "someuser", "profileImageUrl": "https://userpic.redgifs.com/a.png" }
            })))
            .mount(&server)
            .await;
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
                    "id": "1", "name": "Some User", "urls": [],
                    "image_path": null, "alias_list": [], "scene_count": 0
                }] } }
            })))
            .mount(&server)
            .await;

        let core = core_with_stash(
            AppCore {
                redgifs: Arc::new(RedgifsClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::LookupPost {
                site: "redgifs".into(),
                post_id: "abc123".into(),
                post_url: "https://www.redgifs.com/watch/abc123".into(),
            })
            .await;
        match response {
            HostResponse::PostLookup {
                in_stash,
                post,
                creator,
                creator_in_stash,
                ..
            } => {
                assert!(!in_stash);
                assert!(creator_in_stash);
                let post = post.expect("post details resolved");
                assert_eq!(post.title.as_deref(), Some("Having fun in the sun"));
                assert!(matches!(post.media_kind, Some(MediaKind::Video)));
                let creator = creator.expect("creator resolved");
                assert_eq!(creator.username, "someuser");
            }
            other => panic!("expected PostLookup, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn import_post_downloads_redgifs_video_into_library() {
        let server = MockServer::start().await;
        mock_redgifs_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/gifs/abc123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "gif": {
                    "id": "abc123",
                    "description": "Having fun in the sun",
                    "createDate": 1_700_000_000,
                    "type": 1,
                    "height": 1080,
                    "urls": { "hd": format!("{}/media/abc123.mp4", server.uri()) },
                    "userName": "someuser"
                },
                "user": { "username": "someuser" }
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/media/abc123.mp4"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(b"video-bytes".to_vec()))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "performers": [{
                    "id": "1", "name": "Some User", "urls": [],
                    "image_path": null, "alias_list": [], "scene_count": 0
                }] } }
            })))
            .mount(&server)
            .await;

        let library = tempfile::tempdir().unwrap();
        let core = core_with_stash(
            AppCore {
                nfs: Arc::new(LocalFsWriter::new(library.path())),
                redgifs: Arc::new(RedgifsClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::ImportPost {
                site: "redgifs".into(),
                post_id: "abc123".into(),
                post_url: "https://www.redgifs.com/watch/abc123".into(),
                auth_token: None,
            })
            .await;
        match response {
            HostResponse::PostImported {
                files, performer, ..
            } => {
                assert_eq!(files, 1);
                assert_eq!(performer.name, "Some User");
            }
            other => panic!("expected PostImported, got {other:?}"),
        }
        let saved = std::fs::read(library.path().join("redgifs/abc123-1.mp4")).unwrap();
        assert_eq!(saved, b"video-bytes");
    }

    #[tokio::test]
    async fn import_post_refuses_when_redgifs_creator_is_not_in_stash() {
        let server = MockServer::start().await;
        mock_redgifs_token(&server).await;
        Mock::given(method("GET"))
            .and(path("/v2/gifs/abc123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "gif": {
                    "id": "abc123",
                    "description": null,
                    "createDate": 1_700_000_000,
                    "type": 1,
                    "height": 1080,
                    "urls": { "hd": format!("{}/media/abc123.mp4", server.uri()) },
                    "userName": "someuser"
                },
                "user": { "username": "someuser" }
            })))
            .mount(&server)
            .await;
        // No performer matches the creator.
        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "findPerformers": { "performers": [] } }
            })))
            .mount(&server)
            .await;

        let library = tempfile::tempdir().unwrap();
        let core = core_with_stash(
            AppCore {
                nfs: Arc::new(LocalFsWriter::new(library.path())),
                redgifs: Arc::new(RedgifsClient::with_base_url(server.uri())),
                ..test_core()
            },
            &server,
        );

        let response = core
            .handle(HostRequest::ImportPost {
                site: "redgifs".into(),
                post_id: "abc123".into(),
                post_url: "https://www.redgifs.com/watch/abc123".into(),
                auth_token: None,
            })
            .await;
        match response {
            HostResponse::Error { message } => assert!(message.contains("isn't in Stash")),
            other => panic!("expected Error, got {other:?}"),
        }
        assert!(!library.path().join("redgifs").exists());
    }
}
