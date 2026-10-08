//! Message contract shared by the extension, `stasher-host`, and the Tauri app.
//!
//! This crate is the single source of truth for the wire format. TypeScript
//! bindings are generated from these types into `packages/protocol` via
//! `cargo test -p stasher-protocol` (see `tests/export_bindings.rs`).

use std::io::{self, Read, Write};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Length-prefixed JSON framing shared by `stasher-host`'s stdio relay (which
/// must match Firefox's native-messaging wire format exactly) and the Tauri
/// app's Unix-socket server, so the host can forward raw bytes without
/// understanding the payload.
pub mod framing {
    use super::*;

    pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Vec<u8>> {
        let mut len_bytes = [0u8; 4];
        reader.read_exact(&mut len_bytes)?;
        let len = u32::from_ne_bytes(len_bytes) as usize;
        let mut buf = vec![0u8; len];
        reader.read_exact(&mut buf)?;
        Ok(buf)
    }

    pub fn write_frame<W: Write>(writer: &mut W, payload: &[u8]) -> io::Result<()> {
        let len = u32::try_from(payload.len())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "frame too large"))?;
        writer.write_all(&len.to_ne_bytes())?;
        writer.write_all(payload)?;
        writer.flush()
    }
}

/// Where the Tauri app listens and `stasher-host` connects. Both sides must
/// agree on this path without importing from each other.
pub fn socket_path() -> PathBuf {
    std::env::temp_dir().join("stasher.sock")
}

/// Metadata captured from the active tab by the extension.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub struct StashMetadata {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub favicon: Option<String>,
    pub tags: Vec<String>,
    /// RFC 3339 timestamp.
    pub captured_at: String,
}

/// A job handed off from the extension to the desktop app.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub struct StashJob {
    pub id: String,
    pub metadata: StashMetadata,
}

/// Connection details for a self-hosted Stash instance, persisted by the
/// desktop app (see `apps/desktop/src-tauri/src/config.rs`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub struct StashConfig {
    pub stash_url: String,
    pub api_key: String,
}

/// A creator profile detected on a supported site (e.g. a Fansly profile
/// page), before it's known whether a matching Stash performer exists.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub struct SiteProfile {
    pub site: String,
    pub username: String,
    pub profile_url: String,
    pub display_name: Option<String>,
    pub photo_url: Option<String>,
    pub remote_id: Option<String>,
}

/// A performer as known to Stash.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub struct Performer {
    pub id: String,
    pub name: String,
    pub urls: Vec<String>,
    pub image_path: Option<String>,
    pub alias_list: Vec<String>,
    pub scene_count: i32,
}

/// A possible-but-unconfirmed match surfaced alongside an exact lookup, with
/// the reason it was suggested so the UI can explain itself (e.g. "Similar
/// name · no shared URLs").
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub struct PerformerCandidate {
    pub performer: Performer,
    pub shared_urls: bool,
    pub name_similar: bool,
    pub matched_alias: Option<String>,
}

/// Messages sent from the extension, through `stasher-host`, to the Tauri app.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub enum HostRequest {
    /// Tracer-bullet round trip: proves extension -> host -> socket -> app -> back.
    Ping {
        nonce: String,
    },
    SubmitJob {
        job: StashJob,
    },
    /// Is the desktop app running and is its configured Stash reachable?
    GetStatus,
    /// Detected a profile on a supported site; look up an exact Stash match
    /// plus any fuzzy candidates.
    LookupProfile {
        site: String,
        username: String,
        profile_url: String,
    },
    /// Free-text performer search (the popup's "search for someone else").
    SearchPerformers {
        query: String,
    },
    /// Attach a profile URL to an existing performer instead of creating one.
    LinkPerformer {
        performer_id: String,
        profile_url: String,
    },
    /// Create a new Stash performer from a detected profile.
    ImportPerformer {
        profile: SiteProfile,
    },
}

/// Messages sent from the Tauri app, through `stasher-host`, back to the extension.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub enum HostResponse {
    Pong {
        nonce: String,
    },
    JobAccepted {
        id: String,
    },
    Error {
        message: String,
    },
    Status {
        stash_url: Option<String>,
        stash_reachable: bool,
    },
    ProfileLookup {
        profile: SiteProfile,
        exact_match: Option<Performer>,
        candidates: Vec<PerformerCandidate>,
    },
    PerformerSearch {
        candidates: Vec<PerformerCandidate>,
    },
    PerformerLinked {
        performer: Performer,
    },
    PerformerCreated {
        performer: Performer,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `cargo test -p stasher-protocol` regenerates the TS bindings as a side
    /// effect of `#[ts(export)]`; this test just keeps a round-trip honest.
    #[test]
    fn host_request_round_trips() {
        let req = HostRequest::Ping {
            nonce: "abc".into(),
        };
        let json = serde_json::to_string(&req).unwrap();
        let back: HostRequest = serde_json::from_str(&json).unwrap();
        match back {
            HostRequest::Ping { nonce } => assert_eq!(nonce, "abc"),
            _ => panic!("unexpected variant"),
        }
    }
}
