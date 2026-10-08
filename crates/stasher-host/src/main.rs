//! The native-messaging host Firefox launches over stdio. It understands
//! nothing about the message schema: it just relays length-prefixed frames
//! between stdin/stdout (Firefox's wire format) and a Unix socket the Tauri
//! app listens on. This is what lets a long-lived GUI app sit behind a
//! short-lived, Firefox-launched process.

use std::io::{self};
use std::os::unix::net::UnixStream;

use stasher_protocol::framing::{read_frame, write_frame};
use stasher_protocol::{socket_path, HostResponse};

fn main() -> io::Result<()> {
    let mut stdin = io::stdin();
    let mut stdout = io::stdout();

    while let Ok(request) = read_frame(&mut stdin) {
        let response = forward(&request).unwrap_or_else(|err| error_frame(&err));
        write_frame(&mut stdout, &response)?;
    }

    Ok(())
}

fn forward(request: &[u8]) -> io::Result<Vec<u8>> {
    let mut socket = UnixStream::connect(socket_path())?;
    write_frame(&mut socket, request)?;
    read_frame(&mut socket)
}

fn error_frame(err: &io::Error) -> Vec<u8> {
    let response = HostResponse::Error {
        message: format!("stasher-host: {err}"),
    };
    serde_json::to_vec(&response).expect("HostResponse always serializes")
}
