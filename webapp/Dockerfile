# syntax=docker/dockerfile:1.7
#
# KeyPears webapp container.
#
# Builds the TanStack Start webapp with Bun, then produces a slim runtime
# image that decrypts the bundled .env.prod at startup via dotenvx and
# serves the app on $PORT (default 4273).
#
# Build context must be the repo root (not webapp/), because the build
# reaches into ../whitepaper and the bun workspace layout needs sibling
# packages. Build from repo root:
#
#   docker build -f webapp/Dockerfile -t keypears:local .

# ----- builder stage: full toolchain, produces dist/ -----
FROM oven/bun:1 AS builder

WORKDIR /repo

# Install typst — the webapp build step compiles the whitepaper to a PDF
# via `typst compile`, which is part of `bun run build` (build:whitepaper).
# Typst ships static musl binaries from its GitHub releases; they run fine
# on glibc systems like the Bun Debian base because they're self-contained.
ARG TYPST_VERSION=0.14.2
ARG TARGETARCH
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates && \
    case "${TARGETARCH}" in \
        amd64) TYPST_ARCH=x86_64 ;; \
        arm64) TYPST_ARCH=aarch64 ;; \
        *) echo "unsupported arch: ${TARGETARCH}" >&2 && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${TYPST_ARCH}-unknown-linux-musl.tar.xz" \
        -o /tmp/typst.tar.xz && \
    tar -xJf /tmp/typst.tar.xz -C /tmp && \
    mv "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl/typst" /usr/local/bin/typst && \
    rm -rf /tmp/typst.tar.xz "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl" && \
    apt-get purge -y --auto-remove curl xz-utils && \
    rm -rf /var/lib/apt/lists/*

# Copy the whole monorepo. Bun workspaces hoist node_modules to the root,
# and the build pulls from sibling packages/ and ../whitepaper, so a
# partial copy doesn't save us much. .dockerignore keeps this small.
COPY . .

RUN bun install --frozen-lockfile
RUN cd webapp && bun run build

# ----- runtime stage: slim, prod-only -----
FROM oven/bun:1-slim AS runtime

WORKDIR /repo

# Bun hoists dependencies to /repo/node_modules, so we copy that plus
# just the bits the webapp needs to boot: its package.json, the built
# dist/, and the encrypted .env.prod that dotenvx will decrypt at runtime.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/bun.lock ./bun.lock
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/webapp/package.json ./webapp/package.json
COPY --from=builder /repo/webapp/node_modules ./webapp/node_modules
COPY --from=builder /repo/webapp/dist ./webapp/dist
COPY --from=builder /repo/webapp/.env.prod ./webapp/.env.prod

WORKDIR /repo/webapp

ENV NODE_ENV=production
ENV PORT=4273
EXPOSE 4273

# DOTENV_PRIVATE_KEY_PROD is injected at runtime by ECS from the
# `keypears-prod` secret. dotenvx reads it and decrypts .env.prod
# in-memory before the server process starts.
#
# We invoke dotenvx via its workspace-scoped bin symlink rather than
# `bunx dotenvx` because `bunx` looks up the unscoped name `dotenvx` on
# the npm registry and 404s on the real package `@dotenvx/dotenvx`.
CMD ["./node_modules/.bin/dotenvx", "run", "-f", ".env.prod", "--", "bun", "dist/server/server.js"]
