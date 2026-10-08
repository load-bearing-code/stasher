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

/// Messages sent from the extension, through `stasher-host`, to the Tauri app.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub enum HostRequest {
    /// Tracer-bullet round trip: proves extension -> host -> socket -> app -> back.
    Ping {
        nonce: String,
    },
    SubmitJob {
        job: StashJob,
    },
}

/// Messages sent from the Tauri app, through `stasher-host`, back to the extension.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export, export_to = "../../../packages/protocol/src/generated/")]
pub enum HostResponse {
    Pong { nonce: String },
    JobAccepted { id: String },
    Error { message: String },
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
