# syntax=docker/dockerfile:1.12.1-labs

# --- arguments ---------------------------------

ARG GO_VERSION="1.27.2" \
    GO_VERSION_CHECKSUM="sha256:e58d6f83b3416618d8bcac2b3dde1b7f7e3c4a77d25e88637f8bbae81536c48d"

ARG DEBIAN_VERSION="trixie-slim" \
    DEBIAN_VERSION_CHECKSUM="sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f"

# --- base ---------------------------------

FROM docker.io/library/golang:${GO_VERSION}-trixie@${GO_VERSION_CHECKSUM} AS base

ENV CGO_ENABLED=0

WORKDIR /app

# --- dependencies ---------------------------------

FROM base AS dependencies

COPY go.mod go.sum ./

RUN <<-'EOF' /bin/bash -euxo pipefail
  go mod download
EOF

# --- lint ---------------------------------

FROM base AS lint

COPY --from=dependencies /go/pkg/mod /go/pkg/mod
COPY --from=dependencies /app /app
COPY . .

RUN <<-'EOF' /bin/bash -euxo pipefail
  go vet ./...
EOF

# --- test ---------------------------------

FROM base AS test

COPY --from=dependencies /go/pkg/mod /go/pkg/mod
COPY --from=dependencies /app /app
COPY . .

RUN <<-'EOF' /bin/bash -euxo pipefail
  go test ./...
EOF

# --- build ---------------------------------

FROM base AS build

COPY --from=dependencies /go/pkg/mod /go/pkg/mod
COPY --from=dependencies /app /app
COPY . .

RUN <<-'EOF' /bin/bash -euxo pipefail
  go build -o /app/bin/stasher-api ./cmd/stasher-api
EOF

# --- development ---------------------------------

FROM base AS development

RUN <<-'EOF' /bin/bash -euxo pipefail
  go install github.com/air-verse/air@v1.63.0
EOF

COPY --from=dependencies /go/pkg/mod /go/pkg/mod
COPY . .

ENTRYPOINT ["air"]

# --- runtime ---------------------------------

FROM docker.io/library/debian:${DEBIAN_VERSION}@${DEBIAN_VERSION_CHECKSUM} AS runtime

RUN <<-'EOF' /bin/bash -euxo pipefail
  apt-get update
  apt-get install --yes --no-install-recommends \
    "ca-certificates=*"

  apt-get clean
  rm -rf /var/lib/apt/lists/*
EOF

# --- create non-root user ---------------------------------

RUN <<-'EOF' /bin/bash -euxo pipefail
  groupadd -r stasher
  useradd -r -g stasher -d /app stasher
  mkdir -p /app
  chown -R stasher:stasher /app
EOF

WORKDIR /app

COPY --from=build --chown=stasher:stasher /app/bin/stasher-api ./stasher-api
COPY --from=build --chown=stasher:stasher /app/schema ./schema

ARG IMAGE_VERSION \
    IMAGE_BUILD_DATE

LABEL org.opencontainers.image.title="stasher-api"
LABEL org.opencontainers.image.description="Stasher API"
LABEL org.opencontainers.image.created="${IMAGE_BUILD_DATE}"
LABEL org.opencontainers.image.version="${IMAGE_VERSION}"

USER stasher
ENTRYPOINT ["./stasher-api"]
