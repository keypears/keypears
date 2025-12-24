# Stage 1: Install all workspace dependencies
FROM node:24-alpine AS dependencies-env
# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy package.json files for workspace resolution
COPY lib/package.json /app/lib/
COPY pow5-ts/package.json /app/pow5-ts/
COPY api-client/package.json /app/api-client/
COPY api-server/package.json /app/api-server/
COPY web-kp/package.json /app/web-kp/
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build pow5 package
FROM node:24-alpine AS build-pow5
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy pow5 source code
COPY pow5-ts /app/pow5-ts/
# Copy other package.json files for workspace resolution
COPY lib/package.json /app/lib/
COPY api-client/package.json /app/api-client/
COPY api-server/package.json /app/api-server/
COPY web-kp/package.json /app/web-kp/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/pow5-ts/node_modules /app/pow5-ts/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Build pow5 package
RUN pnpm --filter @keypears/pow5 build

# Stage 3: Build lib package
FROM node:24-alpine AS build-lib
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy lib source code
COPY lib /app/lib/
# Copy other package.json files for workspace resolution
COPY pow5-ts/package.json /app/pow5-ts/
COPY api-client/package.json /app/api-client/
COPY api-server/package.json /app/api-server/
COPY web-kp/package.json /app/web-kp/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Build lib package
RUN pnpm --filter @keypears/lib build

# Stage 4: Build api-client package
FROM node:24-alpine AS build-api-client
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy api-client source code
COPY api-client /app/api-client/
# Copy lib source for workspace resolution
COPY lib/package.json /app/lib/
# Copy other package.json files for workspace resolution
COPY pow5-ts/package.json /app/pow5-ts/
COPY api-server/package.json /app/api-server/
COPY web-kp/package.json /app/web-kp/
# Copy built lib from previous stage
COPY --from=build-lib /app/lib/dist /app/lib/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=dependencies-env /app/api-client/node_modules /app/api-client/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Build api-client package
RUN pnpm --filter @keypears/api-client build

# Stage 5: Build api-server package
FROM node:24-alpine AS build-api-server
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy api-server source code
COPY api-server /app/api-server/
# Copy lib, pow5, api-client, and web-kp package.json for workspace resolution
COPY lib/package.json /app/lib/
COPY pow5-ts/package.json /app/pow5-ts/
COPY api-client/package.json /app/api-client/
COPY web-kp/package.json /app/web-kp/
# Copy built lib, pow5, and api-client from previous stages
COPY --from=build-lib /app/lib/dist /app/lib/dist/
COPY --from=build-pow5 /app/pow5-ts/dist /app/pow5-ts/dist/
COPY --from=build-api-client /app/api-client/dist /app/api-client/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=dependencies-env /app/pow5-ts/node_modules /app/pow5-ts/node_modules
COPY --from=dependencies-env /app/api-client/node_modules /app/api-client/node_modules
COPY --from=dependencies-env /app/api-server/node_modules /app/api-server/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Build api-server package
RUN pnpm --filter @keypears/api-server build

# Stage 6: Build web-kp
FROM node:24-alpine AS build-web-kp
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy web-kp source code
COPY web-kp /app/web-kp/
# Copy package.json files for workspace resolution
COPY lib/package.json /app/lib/
COPY pow5-ts/package.json /app/pow5-ts/
COPY api-client/package.json /app/api-client/
COPY api-server/package.json /app/api-server/
# Copy built packages from previous stages
COPY --from=build-lib /app/lib/dist /app/lib/dist/
COPY --from=build-pow5 /app/pow5-ts/dist /app/pow5-ts/dist/
COPY --from=build-api-client /app/api-client/dist /app/api-client/dist/
COPY --from=build-api-server /app/api-server/dist /app/api-server/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=dependencies-env /app/pow5-ts/node_modules /app/pow5-ts/node_modules
COPY --from=dependencies-env /app/api-client/node_modules /app/api-client/node_modules
COPY --from=dependencies-env /app/api-server/node_modules /app/api-server/node_modules
COPY --from=dependencies-env /app/web-kp/node_modules /app/web-kp/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Build web-kp
RUN pnpm --filter @keypears/web-kp build

# Stage 7: Install production dependencies only
FROM node:24-alpine AS production-dependencies-env
# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy package.json files for workspace resolution
COPY lib/package.json /app/lib/
COPY pow5-ts/package.json /app/pow5-ts/
COPY api-client/package.json /app/api-client/
COPY api-server/package.json /app/api-server/
COPY web-kp/package.json /app/web-kp/
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.25.0
# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Stage 8: Final production image
FROM node:24-alpine
# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy lib package files
COPY lib/package.json /app/lib/
COPY --from=build-lib /app/lib/dist /app/lib/dist/
# Copy pow5 package files
COPY pow5-ts/package.json /app/pow5-ts/
COPY --from=build-pow5 /app/pow5-ts/dist /app/pow5-ts/dist/
# Copy api-client package files
COPY api-client/package.json /app/api-client/
COPY --from=build-api-client /app/api-client/dist /app/api-client/dist/
# Copy api-server package files
COPY api-server/package.json /app/api-server/
COPY --from=build-api-server /app/api-server/dist /app/api-server/dist/
# Copy web-kp package and server files
COPY web-kp/package.json web-kp/server.ts /app/web-kp/
# Copy encrypted .env.production (decrypted at runtime via dotenvx + DOTENV_PRIVATE_KEY_PRODUCTION)
COPY web-kp/.env.production /app/web-kp/
# Copy web-kp markdown files (needed for blog at runtime)
COPY web-kp/markdown /app/web-kp/markdown/
# Copy web-kp public directory (needed for .well-known at runtime)
COPY web-kp/public /app/web-kp/public/
# Copy web-kp build output
COPY --from=build-web-kp /app/web-kp/build /app/web-kp/build/
# Copy production node_modules
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=production-dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=production-dependencies-env /app/pow5-ts/node_modules /app/pow5-ts/node_modules
COPY --from=production-dependencies-env /app/api-client/node_modules /app/api-client/node_modules
COPY --from=production-dependencies-env /app/api-server/node_modules /app/api-server/node_modules
COPY --from=production-dependencies-env /app/web-kp/node_modules /app/web-kp/node_modules
# Set working directory to web-kp
WORKDIR /app/web-kp
# Install pnpm globally for the start command
RUN npm install -g pnpm@10.25.0
# Start web-kp with integrated API
CMD ["pnpm", "start"]
