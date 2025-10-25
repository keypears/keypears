#!/bin/bash
set -e

echo "Building API server for Linux x86_64..."

# Build API server for Linux with musl (static linking for Alpine)
cargo build --release --target x86_64-unknown-linux-musl -p api-server

echo "Copying binary to webapp/bin/..."

# Create bin directory in webapp
mkdir -p webapp/bin

# Copy the compiled binary
cp target/x86_64-unknown-linux-musl/release/api-server webapp/bin/api-server

# Make it executable
chmod +x webapp/bin/api-server

echo "✓ API server built successfully!"
echo "  Binary location: webapp/bin/api-server"
