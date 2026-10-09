set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments

default:
    @just --list

dev *ARGS:
    @just _dispatch dev {{ARGS}}

build *ARGS:
    @just _dispatch build {{ARGS}}

test *ARGS:
    @just _dispatch test {{ARGS}}

lint *ARGS:
    @just _dispatch lint {{ARGS}}

_dispatch task *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    declare -A targets=([api]=services/api [extension]=apps/extension)
    for name in "${@:2}"; do
      dir="${targets[$name]:-}"
      if [[ -z "$dir" ]]; then
        echo "unknown target: $name" >&2
        exit 1
      fi
      just --justfile "$dir/justfile" --working-directory "$dir" {{task}}
    done
