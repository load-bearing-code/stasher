//! Fetches post details and signed CDN download URLs from FapHouse's video
//! pages.
//!
//! Unlike Fansly/RedGifs, FapHouse has no public API: the post page itself
//! is server-rendered and embeds everything a download needs as plain HTML
//! attributes on the player element, including per-quality signed,
//! progressive MP4 URLs (`data-el-formats`). No HLS/manifest parsing or
//! ffmpeg mux is needed — the signed URL is a direct, already-muxed file.
//! Those URLs (and the real `data-el-video-title`/studio data for premium
//! posts) only render for an authenticated, subscribed session, so
//! `fetch_post_import` needs the caller's FapHouse session cookie; the
//! cookie is read by the extension (`browser.cookies`, since FapHouse's
//! session cookie is httpOnly) and passed through as `auth_token`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use stasher_protocol::{MediaKind, PostDetails, SiteProfile};

use crate::error::CoreError;

const DEFAULT_BASE_URL: &str = "https://faphouse.com";

/// How many byte-range segments to pull in parallel. The CDN throttles a
/// single sequential connection to ~1 MB/s after an initial burst, but each
/// fresh connection gets its own burst allowance, so a handful of parallel
/// ranges multiplies throughput (measured ~2.3× at four).
const DOWNLOAD_SEGMENTS: u64 = 4;

/// Preferred download quality order; the first one present in
/// `data-el-formats` wins.
const QUALITIES: [&str; 4] = ["1080", "720", "480", "240"];

/// A browser-like `User-Agent` for the post-page fetch, which FapHouse
/// serves a degraded response to otherwise. The CDN itself doesn't require
/// one (it serves the signed URL to any client), but there's no reason to
/// present a different identity for the two steps.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0";

/// Only bounds the TCP/TLS handshake, not the whole request — a video
/// download can legitimately take a while, but a connection that never
/// establishes shouldn't hang the import forever (the extension places no
/// timeout of its own on `importPost`).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// Bounds the gap between reads once connected, rather than the whole
/// request, so a stalled connection fails instead of hanging the import
/// forever — while a large video still has as long as it needs as long as
/// bytes keep arriving.
const READ_TIMEOUT: Duration = Duration::from_secs(30);

pub struct FaphouseClient {
    http: reqwest::Client,
    base_url: String,
}

impl Default for FaphouseClient {
    fn default() -> Self {
        Self::new()
    }
}

impl FaphouseClient {
    pub fn new() -> Self {
        Self::with_base_url(DEFAULT_BASE_URL)
    }

    pub(crate) fn with_base_url(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            // FapHouse's post pages sit behind a WAF that fingerprints the
            // TLS handshake: a `rustls` + HTTP/2 client is served the
            // logged-out page (ignoring the session cookie), so no signed
            // `data-el-formats` render and the import has nothing to
            // download. The OS's native TLS stack, forced to HTTP/1.1,
            // presents a browser-like enough fingerprint to get the real
            // authenticated page. (The CDN that serves the video itself has
            // no such filter — it serves the signed URL to any client.)
            //
            // `http1_only` is also deliberate for the download, not just the
            // page fetch: the CDN throttles each connection after an initial
            // burst, so `download_segmented` relies on its parallel range
            // requests opening separate connections. HTTP/2 would multiplex
            // them onto one connection and share one throttle — measured ~25%
            // slower — so don't be tempted to enable it here.
            .use_native_tls()
            .http1_only()
            .build()
            .expect("reqwest client builds");
        Self {
            http,
            base_url: base_url.into(),
        }
    }

    /// Fetches a post's display details for the preview card, without
    /// authentication. FapHouse renders the title for both anonymous and
    /// signed-in visitors, but the signed download URLs only appear for an
    /// authenticated, subscribed session, so `download_url` is typically
    /// `None` here.
    pub async fn fetch_post(&self, post_id: &str) -> Result<FaphousePostInfo, CoreError> {
        self.fetch_post_with_cookie(post_id, None).await
    }

    /// Fetches a post with the caller's FapHouse session cookie, so the page
    /// renders the signed, downloadable video URLs.
    pub async fn fetch_post_import(
        &self,
        post_id: &str,
        cookie_header: Option<&str>,
    ) -> Result<FaphousePostInfo, CoreError> {
        self.fetch_post_with_cookie(post_id, cookie_header).await
    }

    async fn fetch_post_with_cookie(
        &self,
        post_id: &str,
        cookie_header: Option<&str>,
    ) -> Result<FaphousePostInfo, CoreError> {
        let url = format!("{}/videos/{post_id}", self.base_url);
        tracing::info!(
            post_id,
            has_cookie = cookie_header.is_some(),
            "faphouse: fetching post page"
        );
        let mut request = self
            .http
            .get(&url)
            .header("accept", "text/html,application/xhtml+xml")
            .header("accept-language", "en-US,en;q=0.9")
            .header("referer", "https://faphouse.com/");
        if let Some(cookie) = cookie_header {
            request = request.header("cookie", cookie);
        }
        let response = request.send().await.inspect_err(|err| {
            tracing::warn!(post_id, %err, "faphouse: post page request failed");
        })?;
        tracing::info!(post_id, status = %response.status(), "faphouse: post page responded");
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(CoreError::Stash(format!(
                "faphouse: no video at '{post_id}'"
            )));
        }
        let html = response.error_for_status()?.text().await?;
        tracing::info!(
            post_id,
            html_len = html.len(),
            "faphouse: post page fetched"
        );
        let info = parse_post_page(&html)?;
        tracing::info!(
            post_id,
            has_title = info.details.title.is_some(),
            has_download_url = info.download_url.is_some(),
            has_creator = info.creator.is_some(),
            height = info.height,
            "faphouse: post page parsed"
        );
        Ok(info)
    }

    /// Downloads a signed CDN video URL. The URL is self-authenticating
    /// (signature + expiry in the path), so no cookies or special headers
    /// are needed — the CDN serves it to any client.
    ///
    /// When the file's size is known up front (a `HEAD` the CDN answers),
    /// the body is pulled as `DOWNLOAD_SEGMENTS` parallel byte ranges to beat
    /// the CDN's per-connection throttle; otherwise it falls back to a single
    /// stream. Either way `READ_TIMEOUT` bounds a stalled connection, but the
    /// overall download is unbounded since a full video can run long.
    pub async fn download(&self, url: &str) -> Result<Vec<u8>, CoreError> {
        tracing::info!(url, "faphouse: downloading video");
        match self.content_length(url).await {
            Some(total) if total > 0 => self.download_segmented(url, total).await,
            _ => {
                tracing::info!(url, "faphouse: size unknown, downloading in one stream");
                self.download_stream(url).await
            }
        }
    }

    /// The file's size, or `None` if the CDN won't report it (so a segmented
    /// download isn't possible and the caller falls back to one stream).
    ///
    /// Read from a one-byte range request's `Content-Range` (`bytes 0-0/N`)
    /// rather than a `HEAD`: the CDN doesn't reliably send `Content-Length`
    /// on `HEAD` (it varies by cache node), but a range response always
    /// carries the total. The one-byte body is left unread — dropping the
    /// response closes the connection without pulling the whole file.
    async fn content_length(&self, url: &str) -> Option<u64> {
        let response = self
            .http
            .get(url)
            .header("referer", "https://faphouse.com/")
            .header("range", "bytes=0-0")
            .send()
            .await
            .and_then(|response| response.error_for_status())
            .inspect_err(|err| tracing::warn!(url, %err, "faphouse: size probe failed"))
            .ok()?;
        let content_range = response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)?
            .to_str()
            .ok()?;
        // `bytes 0-0/205967593` -> 205967593
        content_range.rsplit('/').next()?.trim().parse::<u64>().ok()
    }

    /// Pulls `DOWNLOAD_SEGMENTS` contiguous byte ranges concurrently and
    /// stitches them back together in order. A background task logs aggregate
    /// progress every few seconds.
    async fn download_segmented(&self, url: &str, total: u64) -> Result<Vec<u8>, CoreError> {
        let seg_len = total.div_ceil(DOWNLOAD_SEGMENTS);
        let downloaded = Arc::new(AtomicU64::new(0));

        let monitor = tokio::spawn({
            let downloaded = downloaded.clone();
            let url = url.to_string();
            async move {
                let mut tick = tokio::time::interval(Duration::from_secs(3));
                tick.tick().await; // fires immediately; skip it
                loop {
                    tick.tick().await;
                    let done = downloaded.load(Ordering::Relaxed);
                    tracing::info!(
                        url,
                        downloaded = done,
                        total,
                        percent = (done as f64 / total as f64 * 100.0) as u32,
                        "faphouse: download progress"
                    );
                }
            }
        });

        let mut handles = Vec::new();
        let mut start = 0u64;
        while start < total {
            let end = (start + seg_len - 1).min(total - 1);
            let client = self.http.clone();
            let url = url.to_string();
            let downloaded = downloaded.clone();
            handles.push(tokio::spawn(async move {
                download_range(&client, &url, start, end, &downloaded).await
            }));
            start = end + 1;
        }

        let mut bytes = Vec::with_capacity(total as usize);
        let mut result = Ok(());
        for handle in handles {
            match handle.await {
                Ok(Ok(segment)) if result.is_ok() => bytes.extend_from_slice(&segment),
                Ok(Ok(_)) => {}
                Ok(Err(err)) if result.is_ok() => result = Err(err),
                Ok(Err(_)) => {}
                Err(join) if result.is_ok() => {
                    result = Err(CoreError::Stash(format!(
                        "faphouse: a download segment panicked: {join}"
                    )))
                }
                Err(_) => {}
            }
        }
        monitor.abort();
        result?;

        if bytes.len() as u64 != total {
            return Err(CoreError::Stash(format!(
                "faphouse: expected {total} bytes but assembled {}",
                bytes.len()
            )));
        }
        tracing::info!(url, bytes = bytes.len(), "faphouse: download finished");
        Ok(bytes)
    }

    /// Single-connection fallback for when the size is unknown, streaming the
    /// body chunk by chunk with periodic progress logs.
    async fn download_stream(&self, url: &str) -> Result<Vec<u8>, CoreError> {
        let mut response = self
            .http
            .get(url)
            .header("accept", "*/*")
            .header("referer", "https://faphouse.com/")
            .send()
            .await
            .and_then(|response| response.error_for_status())
            .inspect_err(|err| tracing::warn!(url, %err, "faphouse: download request failed"))?;

        let mut bytes = Vec::new();
        const LOG_EVERY: usize = 10 * 1024 * 1024;
        let mut next_log = LOG_EVERY;
        while let Some(chunk) = response.chunk().await.inspect_err(|err| {
            tracing::warn!(url, downloaded = bytes.len(), %err, "faphouse: download stream failed");
        })? {
            bytes.extend_from_slice(&chunk);
            if bytes.len() >= next_log {
                next_log = bytes.len() + LOG_EVERY;
                tracing::info!(url, downloaded = bytes.len(), "faphouse: download progress");
            }
        }
        tracing::info!(url, bytes = bytes.len(), "faphouse: download finished");
        Ok(bytes)
    }
}

/// Downloads one inclusive byte range (`start..=end`), streaming into a
/// buffer and adding each chunk's length to the shared `downloaded` counter
/// so the caller's progress monitor can report aggregate throughput.
async fn download_range(
    client: &reqwest::Client,
    url: &str,
    start: u64,
    end: u64,
    downloaded: &AtomicU64,
) -> Result<Vec<u8>, CoreError> {
    let mut response = client
        .get(url)
        .header("accept", "*/*")
        .header("referer", "https://faphouse.com/")
        .header("range", format!("bytes={start}-{end}"))
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .inspect_err(|err| tracing::warn!(url, start, end, %err, "faphouse: segment request failed"))?;

    let mut buf = Vec::with_capacity((end - start + 1) as usize);
    while let Some(chunk) = response.chunk().await.inspect_err(|err| {
        tracing::warn!(url, start, end, %err, "faphouse: segment stream failed");
    })? {
        downloaded.fetch_add(chunk.len() as u64, Ordering::Relaxed);
        buf.extend_from_slice(&chunk);
    }
    Ok(buf)
}

/// Everything a post lookup or import needs from one page fetch.
#[derive(Debug, Clone)]
pub struct FaphousePostInfo {
    pub details: PostDetails,
    /// `None` when the page has no studio link to resolve a creator from.
    pub creator: Option<SiteProfile>,
    /// `None` when the viewer isn't authenticated/subscribed, so FapHouse
    /// didn't render signed download URLs.
    pub download_url: Option<String>,
    pub extension: String,
    pub height: u32,
}

fn parse_post_page(html: &str) -> Result<FaphousePostInfo, CoreError> {
    let title = quoted_attr(html, "data-el-video-title").map(decode_html_entities);
    let media_kind = Some(MediaKind::Video);

    let (download_url, height) = match parse_formats(html) {
        Some(formats) => QUALITIES
            .iter()
            .find_map(|quality| formats.get(*quality).map(|url| (url.clone(), *quality)))
            .map(|(url, quality)| (Some(url), quality.parse().unwrap_or(0)))
            .unwrap_or((None, 0)),
        None => (None, 0),
    };

    let creator = studio_profile_url(html).map(|profile_url| {
        let username = profile_url
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .to_string();
        let display_name = quoted_attr(html, "data-el-studio-name").map(decode_html_entities);
        SiteProfile {
            site: "faphouse".into(),
            username: username.clone(),
            profile_url,
            display_name,
            photo_url: None,
            remote_id: Some(username),
            bio: None,
            location: None,
            links: Vec::new(),
            tags: Vec::new(),
        }
    });

    Ok(FaphousePostInfo {
        details: PostDetails {
            title,
            posted_at: None,
            media_kind,
        },
        creator,
        download_url,
        extension: "mp4".into(),
        height,
    })
}

/// A normally-quoted HTML attribute's value, e.g. `name="value"`.
fn quoted_attr(html: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    let start = html.find(&needle)? + needle.len();
    let end = html[start..].find('"')? + start;
    Some(html[start..end].to_string())
}

/// FapHouse emits its JSON-blob attributes (`data-el-formats`,
/// `data-el-av1-formats`) unquoted, since the JSON uses `&quot;` entities
/// instead of literal `"` and so never needs the surrounding quotes HTML
/// normally requires. The value runs until the next whitespace.
fn bare_attr<'a>(html: &'a str, name: &str) -> Option<&'a str> {
    let needle = format!("{name}=");
    let start = html.find(&needle)? + needle.len();
    let rest = &html[start..];
    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    Some(&rest[..end])
}

fn decode_html_entities(value: String) -> String {
    value.replace("&quot;", "\"").replace("&amp;", "&")
}

fn parse_formats(html: &str) -> Option<HashMap<String, String>> {
    let raw = bare_attr(html, "data-el-formats")?;
    let decoded = decode_html_entities(raw.to_string());
    serde_json::from_str(&decoded).ok()
}

/// The post's studio/model profile URL, read from the `href` of the studio
/// avatar link (which precedes its `fh-studio-avatar` class in the markup).
fn studio_profile_url(html: &str) -> Option<String> {
    let marker_idx = html.find("fh-studio-avatar")?;
    let before = &html[..marker_idx];
    let href_start = before.rfind("href=\"")? + "href=\"".len();
    let href_end = before[href_start..].find('"')? + href_start;
    Some(format!(
        "https://faphouse.com{}",
        &before[href_start..href_end]
    ))
}

#[cfg(test)]
mod tests {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    const SAMPLE_PAGE: &str = r#"
        <div data-el-video-title="Pregnant MILF Wife Gets Fucked">
        <a href="/models/testicarl" class="fh-studio-avatar video-info-details__studio-avatar">Testicarl</a>
        <div id="video-full"
             data-el-video-title="Pregnant MILF Wife Gets Fucked"
             data-el-studio-name="Testicarl"
             data-el-formats={&quot;240&quot;:&quot;https://video-nss.flixcdn.com/sig,1/lD/format/240.mp4&quot;,&quot;720&quot;:&quot;https://video-nss.flixcdn.com/sig,1/lD/format/720.mp4&quot;,&quot;1080&quot;:&quot;https://video-nss.flixcdn.com/sig,1/lD/format/1080.mp4&quot;}
        ></div>
        </div>
    "#;

    #[test]
    fn parse_post_page_picks_highest_quality_and_creator() {
        let info = parse_post_page(SAMPLE_PAGE).unwrap();
        assert_eq!(
            info.details.title.as_deref(),
            Some("Pregnant MILF Wife Gets Fucked")
        );
        assert!(matches!(info.details.media_kind, Some(MediaKind::Video)));
        assert_eq!(
            info.download_url.as_deref(),
            Some("https://video-nss.flixcdn.com/sig,1/lD/format/1080.mp4")
        );
        assert_eq!(info.height, 1080);
        assert_eq!(info.extension, "mp4");

        let creator = info.creator.unwrap();
        assert_eq!(creator.site, "faphouse");
        assert_eq!(creator.username, "testicarl");
        assert_eq!(creator.profile_url, "https://faphouse.com/models/testicarl");
        assert_eq!(creator.display_name.as_deref(), Some("Testicarl"));
    }

    #[test]
    fn parse_post_page_has_no_download_url_when_unauthenticated() {
        let html = r#"<div data-el-video-title="Some Title"></div>"#;
        let info = parse_post_page(html).unwrap();
        assert_eq!(info.details.title.as_deref(), Some("Some Title"));
        assert!(info.download_url.is_none());
        assert!(info.creator.is_none());
    }

    #[tokio::test]
    async fn fetch_post_import_sends_the_session_cookie() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/videos/lDXCTj"))
            .respond_with(ResponseTemplate::new(200).set_body_string(SAMPLE_PAGE))
            .mount(&server)
            .await;

        let client = FaphouseClient::with_base_url(server.uri());
        let info = client
            .fetch_post_import("lDXCTj", Some("session=abc123"))
            .await
            .unwrap();

        assert_eq!(info.height, 1080);
    }

    #[tokio::test]
    async fn fetch_post_errors_on_missing_video() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/videos/ghost"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let client = FaphouseClient::with_base_url(server.uri());
        let result = client.fetch_post("ghost").await;
        assert!(result.is_err());
    }
}
