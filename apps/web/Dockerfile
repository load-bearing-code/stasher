# syntax=docker/dockerfile:1.12.1-labs

# This Dockerfile expects the repository root as its build context, because
# @stasher/web depends on sibling workspace packages (@stasher/ui, core,
# protocol). Build it via compose (apps/web/Dockerfile + context: .).

# --- arguments ---------------------------------

ARG NODE_VERSION="26.10.0" \
    NODE_VERSION_CHECKSUM="sha256:930557a230abacbc3f4fd9b8648abf8f4bee1e17cb72195dcdfb2f709bc85b33"

ARG CADDY_VERSION="2-alpine" \
    CADDY_VERSION_CHECKSUM="sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f"

ARG PNPM_VERSION="12.9.1"

# --- base ---------------------------------

FROM docker.io/library/node:${NODE_VERSION}-trixie-slim@${NODE_VERSION_CHECKSUM} AS base

ARG PNPM_VERSION

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:${PATH}"

WORKDIR /app

RUN <<-'EOF' /bin/bash -euxo pipefail
  npm install --global "pnpm@${PNPM_VERSION}"
EOF

# --- dependencies ---------------------------------

FROM base AS dependencies

# Copy every workspace manifest so pnpm can resolve the workspace graph against
# the frozen lockfile, then install only the web app and its dependencies.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,target=/pnpm/store <<-'EOF' /bin/bash -euxo pipefail
  pnpm install --frozen-lockfile --filter "@stasher/web..."
EOF

# --- development ---------------------------------

FROM dependencies AS development

COPY . .

EXPOSE 1430

# --host binds vite to 0.0.0.0 so the dev server is reachable from the host.
ENTRYPOINT ["pnpm", "--filter", "@stasher/web", "dev", "--host"]

# --- build ---------------------------------

FROM dependencies AS build

COPY . .

RUN <<-'EOF' /bin/bash -euxo pipefail
  pnpm --filter @stasher/web build
EOF

# --- runtime ---------------------------------

FROM docker.io/library/caddy:${CADDY_VERSION}@${CADDY_VERSION_CHECKSUM} AS runtime

# --- create non-root user ---------------------------------

RUN <<-'EOF' /bin/sh -euxo pipefail
  addgroup -S stasher
  adduser -S -G stasher -h /srv stasher
  mkdir -p /data/caddy /config/caddy
  chown -R stasher:stasher /srv /data /config
EOF

ENV XDG_DATA_HOME="/data" \
    XDG_CONFIG_HOME="/config"

COPY <<-'EOF' /etc/caddy/Caddyfile
	:8080 {
		root * /srv
		encode gzip zstd

		# SPA fallback: unknown paths resolve to index.html so client-side routing works.
		try_files {path} /index.html
		file_server
	}
EOF

COPY --from=build --chown=stasher:stasher /app/apps/web/dist /srv

ARG IMAGE_VERSION \
    IMAGE_BUILD_DATE

LABEL org.opencontainers.image.title="stasher-web"
LABEL org.opencontainers.image.description="Stasher web app served by Caddy"
LABEL org.opencontainers.image.created="${IMAGE_BUILD_DATE}"
LABEL org.opencontainers.image.version="${IMAGE_VERSION}"

USER stasher

EXPOSE 8080
