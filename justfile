set shell := ["bash", "-euo", "pipefail", "-c"]

all_apps := "extension desktop"

# List available recipes
default:
    @just --list

# Build one or more apps (all apps if none given): just build extension
build *APPS:
    #!/usr/bin/env bash
    set -euo pipefail
    apps="{{ if APPS == "" { all_apps } else { APPS } }}"
    args=()
    for app in $apps; do
        args+=(--filter "./apps/$app")
    done
    pnpm exec turbo run build "${args[@]}"

# Run one or more apps in dev mode (all apps if none given): just dev desktop
dev *APPS:
    #!/usr/bin/env bash
    set -euo pipefail
    apps="{{ if APPS == "" { all_apps } else { APPS } }}"
    args=()
    for app in $apps; do
        args+=(--filter "./apps/$app")
    done
    pnpm exec turbo run dev "${args[@]}"

# Build everything and zip the Firefox extension
release: build
    pnpm --filter @stasher/extension zip:firefox
