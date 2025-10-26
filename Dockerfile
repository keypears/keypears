# Stage 1: Install all workspace dependencies
FROM node:24-alpine AS dependencies-env
# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy package.json files for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY api-client/package.json /app/api-client/
COPY webapp/package.json /app/webapp/
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build ts-lib package
FROM node:24-alpine AS build-ts-lib
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy ts-lib source code
COPY ts-lib /app/ts-lib/
# Copy other package.json files for workspace resolution
COPY api-client/package.json /app/api-client/
COPY webapp/package.json /app/webapp/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build ts-lib package
RUN pnpm --filter @keypears/lib build

# Stage 3: Build api-client package
FROM node:24-alpine AS build-api-client
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy api-client source code
COPY api-client /app/api-client/
# Copy ts-lib and webapp package.json for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY webapp/package.json /app/webapp/
# Copy built ts-lib from previous stage
COPY --from=build-ts-lib /app/ts-lib/dist /app/ts-lib/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
COPY --from=dependencies-env /app/api-client/node_modules /app/api-client/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build api-client package
RUN pnpm --filter @keypears/api-client build

# Stage 4: Build webapp
FROM node:24-alpine AS build-webapp
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy webapp source code
COPY webapp /app/webapp/
# Copy package.json files for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY api-client/package.json /app/api-client/
# Copy built packages from previous stages
COPY --from=build-ts-lib /app/ts-lib/dist /app/ts-lib/dist/
COPY --from=build-api-client /app/api-client/dist /app/api-client/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
COPY --from=dependencies-env /app/api-client/node_modules /app/api-client/node_modules
COPY --from=dependencies-env /app/webapp/node_modules /app/webapp/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build webapp
RUN pnpm --filter @keypears/webapp build

# Stage 5: Install production dependencies only
FROM node:24-alpine AS production-dependencies-env
# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy package.json files for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY api-client/package.json /app/api-client/
COPY webapp/package.json /app/webapp/
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Stage 6: Final production image
FROM node:24-alpine
# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy ts-lib package files
COPY ts-lib/package.json /app/ts-lib/
COPY --from=build-ts-lib /app/ts-lib/dist /app/ts-lib/dist/
# Copy api-client package files
COPY api-client/package.json /app/api-client/
COPY --from=build-api-client /app/api-client/dist /app/api-client/dist/
# Copy webapp package and server files
COPY webapp/package.json webapp/server.ts /app/webapp/
# Copy webapp markdown files (needed for blog at runtime)
COPY webapp/markdown /app/webapp/markdown/
# Copy webapp build output
COPY --from=build-webapp /app/webapp/build /app/webapp/build/
# Copy production node_modules
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=production-dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
COPY --from=production-dependencies-env /app/api-client/node_modules /app/api-client/node_modules
COPY --from=production-dependencies-env /app/webapp/node_modules /app/webapp/node_modules
# Copy pre-built KeyPears node binary
RUN mkdir -p /app/bin
COPY webapp/bin/keypears-node /app/bin/keypears-node
RUN chmod +x /app/bin/keypears-node
# Copy start script
COPY webapp/start.sh /app/start.sh
RUN chmod +x /app/start.sh
# Set working directory to webapp
WORKDIR /app/webapp
# Install pnpm globally for the start command
RUN npm install -g pnpm@10.17.0
# Start both servers via script
CMD ["/app/start.sh"]
