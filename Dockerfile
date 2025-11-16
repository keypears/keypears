# Stage 1: Install all workspace dependencies
FROM node:24-alpine AS dependencies-env
# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy package.json files for workspace resolution
COPY lib/package.json /app/lib/
COPY api-server/package.json /app/api-server/
COPY webapp/package.json /app/webapp/
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build lib package
FROM node:24-alpine AS build-lib
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy lib source code
COPY lib /app/lib/
# Copy other package.json files for workspace resolution
COPY api-server/package.json /app/api-server/
COPY webapp/package.json /app/webapp/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build lib package
RUN pnpm --filter @keypears/lib build

# Stage 3: Build node package
FROM node:24-alpine AS build-api-server
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy node source code
COPY api-server /app/api-server/
# Copy lib and webapp package.json for workspace resolution
COPY lib/package.json /app/lib/
COPY webapp/package.json /app/webapp/
# Copy built lib from previous stage
COPY --from=build-lib /app/lib/dist /app/lib/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=dependencies-env /app/api-server/node_modules /app/api-server/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build api-server package
RUN pnpm --filter @keypears/api-server build

# Stage 4: Build webapp
FROM node:24-alpine AS build-webapp
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy webapp source code
COPY webapp /app/webapp/
# Copy package.json files for workspace resolution
COPY lib/package.json /app/lib/
COPY api-server/package.json /app/api-server/
# Copy built packages from previous stages
COPY --from=build-lib /app/lib/dist /app/lib/dist/
COPY --from=build-api-server /app/api-server/dist /app/api-server/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=dependencies-env /app/api-server/node_modules /app/api-server/node_modules
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
COPY lib/package.json /app/lib/
COPY api-server/package.json /app/api-server/
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
# Copy lib package files
COPY lib/package.json /app/lib/
COPY --from=build-lib /app/lib/dist /app/lib/dist/
# Copy node package files
COPY api-server/package.json /app/api-server/
COPY --from=build-api-server /app/api-server/dist /app/api-server/dist/
# Copy webapp package and server files
COPY webapp/package.json webapp/server.ts /app/webapp/
# Copy webapp markdown files (needed for blog at runtime)
COPY webapp/markdown /app/webapp/markdown/
# Copy webapp public directory (needed for .well-known at runtime)
COPY webapp/public /app/webapp/public/
# Copy webapp build output
COPY --from=build-webapp /app/webapp/build /app/webapp/build/
# Copy production node_modules
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=production-dependencies-env /app/lib/node_modules /app/lib/node_modules
COPY --from=production-dependencies-env /app/api-server/node_modules /app/api-server/node_modules
COPY --from=production-dependencies-env /app/webapp/node_modules /app/webapp/node_modules
# Set working directory to webapp
WORKDIR /app/webapp
# Install pnpm globally for the start command
RUN npm install -g pnpm@10.17.0
# Start webapp with integrated API
CMD ["pnpm", "start"]
