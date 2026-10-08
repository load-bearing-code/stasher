#!/usr/bin/env bash
# Downloads an ffmpeg binary into this directory, named for the current
# Rust target triple, as Tauri's sidecar bundling expects
# (binaries/ffmpeg-<target-triple>[.exe]). Run this once before `tauri dev`
# or `tauri build`; the binary itself is gitignored, not committed.
#
# Only macOS is automated here. For Linux/Windows, download a static
# build yourself (e.g. https://johnvansickle.com/ffmpeg/ for Linux,
# https://www.gyan.dev/ffmpeg/builds/ for Windows) and place it at
# binaries/ffmpeg-<target-triple>[.exe] — find your triple with
# `rustc -vV | grep host`.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

triple="$(rustc -vV | awk '/^host:/ { print $2 }')"
if [[ -z "$triple" ]]; then
  echo "couldn't determine the Rust target triple (is rustc on PATH?)" >&2
  exit 1
fi

dest="ffmpeg-${triple}"
if [[ -f "$dest" ]]; then
  echo "$dest already exists, skipping"
  exit 0
fi

case "$triple" in
  aarch64-apple-darwin|x86_64-apple-darwin)
    archive="ffmpeg-7.1.7z"
    url="https://evermeet.cx/ffmpeg/${archive}"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    echo "downloading ffmpeg for ${triple} from evermeet.cx..."
    curl -fsSL "$url" -o "$tmp/ffmpeg.7z"
    if ! command -v 7z >/dev/null 2>&1; then
      echo "this needs 7z to unpack (brew install p7zip)" >&2
      exit 1
    fi
    7z x "$tmp/ffmpeg.7z" -o"$tmp" >/dev/null
    mv "$tmp/ffmpeg" "$dest"
    chmod +x "$dest"
    echo "wrote $dest"
    ;;
  *)
    echo "no automated fetch for $triple — see the comment at the top of this script" >&2
    exit 1
    ;;
esac
