# Stage 1: Install development dependencies
FROM node:24-alpine AS development-dependencies-env
# Copy the entire project, including package.json and pnpm-lock.yaml
COPY . /app
WORKDIR /app
# Install pnpm globally using npm
RUN npm install -g pnpm@10.17.0
# Install dependencies using pnpm (will use pnpm-lock.yaml if present)
RUN pnpm install --frozen-lockfile

# Stage 2: Install production dependencies
FROM node:24-alpine AS production-dependencies-env
# Copy only package.json and pnpm-lock.yaml for dependency installation
COPY ./package.json ./pnpm-lock.yaml /app/
WORKDIR /app
# Install pnpm globally using npm
RUN npm install -g pnpm@10.17.0
# Install production dependencies only using pnpm
RUN pnpm install --prod --frozen-lockfile

# Stage 3: Build the application
FROM node:24-alpine AS build-env
# Copy the entire project
COPY . /app/
# Copy node_modules from development-dependencies-env stage
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
# Install pnpm globally using npm
RUN npm install -g pnpm@10.17.0
# Run the build script using pnpm
RUN pnpm run build

# Stage 4: Final production image
FROM node:24-alpine
# Copy necessary files for running the app
COPY ./package.json ./server.js /app/
# Copy production node_modules from production-dependencies-env stage
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
# Copy build output from build-env stage
COPY --from=build-env /app/build /app/build
WORKDIR /app
# Install pnpm globally using npm for the start command
RUN npm install -g pnpm@10.17.0
# Start the application using pnpm
CMD ["pnpm", "run", "start"]
