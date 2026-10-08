# Architecture

Stasher captures page metadata in a Firefox extension, hands it to a Tauri
desktop app, and the desktop app writes media to an NFS volume and metadata
to a self-hosted [Stash](https://docs.stashapp.cc/api/) instance over GraphQL.

```
Firefox Extension (WXT + React, apps/extension)
  │  capture page/tab metadata (@stasher/core), issue stash jobs
  │  browser.runtime.connectNative("ar.schw.stasher")
  ▼
stasher-host  (crates/stasher-host — thin stdio⇄socket relay)
  │  length-prefixed JSON frames, byte-for-byte identical on both sides
  ▼
Tauri desktop app (apps/desktop/src-tauri)
  ├─ AppCore (crates/stasher-core): FfmpegProcessor / NfsWriter / StashClient
  ├─ NFS volume  ← LocalFsWriter writes media artifacts directly
  └─ Stash GraphQL (`<server>:<port>/graphql`, `ApiKey` header) ← metadata
```

## Why a separate `stasher-host` binary

Firefox's native-messaging API launches a **short-lived stdio process** per
extension session — not a long-running GUI app. A Tauri app can't itself be
registered as that process. `stasher-host` is a small Rust binary that *is*
the registered host: it does no parsing, just relays length-prefixed frames
between stdin/stdout (Firefox's wire format — a 4-byte native-byte-order
length prefix + JSON, max 1&nbsp;MB app→extension / 4&nbsp;GB extension→app)
and a Unix domain socket the Tauri app listens on
(`crates/stasher-protocol::socket_path()`, currently `$TMPDIR/stasher.sock`).

Because both sides use the identical framing
(`stasher_protocol::framing::{read_frame, write_frame}`), `stasher-host`
never needs to know the message schema — it just copies bytes. This is also
why media bytes must never cross native messaging: only job requests and
small status/metadata do.

## Single source of truth for messages

`crates/stasher-protocol` defines `HostRequest`/`HostResponse`/`StashJob`/
`StashMetadata` once, in Rust. TypeScript bindings are generated from these
exact types via [`ts-rs`](https://github.com/Aleph-Alpha/ts-rs) into
`packages/protocol/src/generated/`, re-exported from `packages/protocol/src/index.ts`.

Regenerate after changing a type in `crates/stasher-protocol/src/lib.rs`:

```sh
cargo test -p stasher-protocol
```

## Installing the native-messaging host

On macOS and Linux:

```sh
just install
```

This builds `stasher-host` in release mode, builds the extension for
Firefox, and writes the native-messaging manifest
(`crates/stasher-host/native-manifest/ar.schw.stasher.json.template`) to
wherever Firefox looks for it, with the real absolute path to the binary
filled in. See `justfile` for exactly what it does. Two steps can't be
scripted and are printed by `just install` as a reminder:

1. Start the desktop app: `pnpm --filter @stasher/desktop tauri dev`
2. Load the built extension via `about:debugging` → "This Firefox" → "Load
   Temporary Add-on" → `apps/extension/.output/firefox-mv2/manifest.json`

Windows isn't scripted (`just install` errors out there) — it needs a
`HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\ar.schw.stasher`
registry key pointing at the manifest file instead of a file in a fixed
directory; see
[MDN's native-messaging guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging#windows_setup).

Once installed, `stasher-host` connects to the Tauri app's Unix socket on
each message and reports a `HostResponse::Error` frame back to the
extension if the app isn't running.

This will eventually be automated further by the Tauri app's own installer
(registering the manifest on first run) instead of a `just` recipe.

## Shared UI (`@stasher/ui`)

Both React surfaces (the extension's popup/content-script UI and the Tauri
window) consume the same shadcn component package, using the
[Base UI](https://base-ui.com) backend and Tailwind v4. Components are added
from either app with `pnpm dlx shadcn@latest add <component>` — the CLI
resolves `packages/ui`'s `components.json` aliases and installs there.

**Portal caveat:** the extension's content-script UI renders inside a
[shadow root](https://wxt.dev/guide/essentials/content-scripts.html#shadow-root)
(`createShadowRootUi`) to isolate styles from the host page. Any Base UI
component that portals to `document.body` by default (Dialog, Popover,
DropdownMenu, Select) will escape that shadow root and lose the isolated
styles unless given an explicit portal container pointed at the shadow root.
None of the current components (`Button`, `Card`) portal, so this hasn't
been wired yet — do it before adding a portaling component to the content
script.

## Deferred / explicitly out of scope for this scaffold

- **ffmpeg**: `FfmpegProcessor` (`crates/stasher-core/src/ffmpeg.rs`) is a
  trait with a no-op stub. Real processing should shell out to `ffmpeg` (or
  `ffmpeg-next`) from the Tauri app — not WASM in the extension, since MV3's
  CSP and Firefox's `SharedArrayBuffer`/cross-origin-isolation requirements
  make `ffmpeg.wasm` painful there, and the Tauri app has no such limits.
- **Stash GraphQL client**: `StashClient` (`crates/stasher-core/src/stash.rs`)
  is a trait with a stub (`LoggingStashClient`) that logs instead of calling
  Stash. The real implementation needs an introspected schema and a GraphQL
  client (e.g. `graphql_client`), authenticating with the `ApiKey` header
  documented at <https://docs.stashapp.cc/api/>.
- **`apps/api`**: not needed — Stash's own GraphQL API is the backend.
