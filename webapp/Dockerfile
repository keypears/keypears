# syntax=docker/dockerfile:1.7
#
# KeyPears webapp container.
#
# Builds the TanStack Start webapp with pnpm, then produces a slim Node runtime
# image that decrypts the bundled .env.prod at startup via dotenvx and
# serves the app on $PORT (default 4273).
#
# Build context must be the repo root (not webapp/), because the pnpm
# workspace layout needs sibling packages. Build from repo root:
#
#   docker build -f webapp/Dockerfile -t keypears:local .

# ----- builder stage: full toolchain, produces Nitro output -----
FROM node:22-slim AS builder

WORKDIR /repo
RUN corepack enable

# Copy the whole monorepo. pnpm workspaces link dependencies from the root,
# so a partial copy doesn't save us much. .dockerignore keeps this small.
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @keypears/client --filter @keypears/pow5 run build
RUN pnpm --filter @keypears/webapp run build

# ----- runtime stage: slim, prod-only -----
FROM node:22-slim AS runtime

WORKDIR /repo
RUN corepack enable

# pnpm links workspace dependencies through /repo/node_modules, so we copy that plus
# just the bits the webapp needs to boot: its package.json, the built
# Nitro output, and the encrypted .env.prod that dotenvx will decrypt at runtime.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/webapp/package.json ./webapp/package.json
COPY --from=builder /repo/webapp/node_modules ./webapp/node_modules
COPY --from=builder /repo/webapp/.output ./webapp/.output
COPY --from=builder /repo/webapp/.env.prod ./webapp/.env.prod

WORKDIR /repo/webapp

ENV NODE_ENV=production
ENV PORT=4273
EXPOSE 4273

# DOTENV_PRIVATE_KEY_PROD is injected at runtime by ECS from the
# `keypears-prod` secret. dotenvx reads it and decrypts .env.prod
# in-memory before the server process starts.
#
CMD ["./node_modules/.bin/dotenvx", "run", "-f", ".env.prod", "--", "node", ".output/server/index.mjs"]
