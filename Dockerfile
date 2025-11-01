# Stage 1: Install all workspace dependencies
FROM node:24-alpine AS dependencies-env
# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy package.json files for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY ts-node/package.json /app/ts-node/
COPY ts-webapp/package.json /app/ts-webapp/
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
COPY ts-node/package.json /app/ts-node/
COPY ts-webapp/package.json /app/ts-webapp/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build ts-lib package
RUN pnpm --filter @keypears/lib build

# Stage 3: Build ts-node package
FROM node:24-alpine AS build-ts-node
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy ts-node source code
COPY ts-node /app/ts-node/
# Copy ts-lib and webapp package.json for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY ts-webapp/package.json /app/ts-webapp/
# Copy built ts-lib from previous stage
COPY --from=build-ts-lib /app/ts-lib/dist /app/ts-lib/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
COPY --from=dependencies-env /app/ts-node/node_modules /app/ts-node/node_modules
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm@10.17.0
# Build ts-node package
RUN pnpm --filter @keypears/node build

# Stage 4: Build webapp
FROM node:24-alpine AS build-webapp
# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml /app/
# Copy webapp source code
COPY ts-webapp /app/ts-webapp/
# Copy package.json files for workspace resolution
COPY ts-lib/package.json /app/ts-lib/
COPY ts-node/package.json /app/ts-node/
# Copy built packages from previous stages
COPY --from=build-ts-lib /app/ts-lib/dist /app/ts-lib/dist/
COPY --from=build-ts-node /app/ts-node/dist /app/ts-node/dist/
# Copy node_modules from dependencies stage
COPY --from=dependencies-env /app/node_modules /app/node_modules
COPY --from=dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
COPY --from=dependencies-env /app/ts-node/node_modules /app/ts-node/node_modules
COPY --from=dependencies-env /app/ts-webapp/node_modules /app/ts-webapp/node_modules
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
COPY ts-node/package.json /app/ts-node/
COPY ts-webapp/package.json /app/ts-webapp/
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
# Copy ts-node package files
COPY ts-node/package.json /app/ts-node/
COPY --from=build-ts-node /app/ts-node/dist /app/ts-node/dist/
# Copy webapp package and server files
COPY ts-webapp/package.json ts-webapp/server.ts /app/ts-webapp/
# Copy webapp markdown files (needed for blog at runtime)
COPY ts-webapp/markdown /app/ts-webapp/markdown/
# Copy webapp build output
COPY --from=build-webapp /app/ts-webapp/build /app/ts-webapp/build/
# Copy production node_modules
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=production-dependencies-env /app/ts-lib/node_modules /app/ts-lib/node_modules
COPY --from=production-dependencies-env /app/ts-node/node_modules /app/ts-node/node_modules
COPY --from=production-dependencies-env /app/ts-webapp/node_modules /app/ts-webapp/node_modules
# Set working directory to webapp
WORKDIR /app/ts-webapp
# Install pnpm globally for the start command
RUN npm install -g pnpm@10.17.0
# Start webapp with integrated API
CMD ["pnpm", "start"]
