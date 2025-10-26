#!/bin/bash
set -e

echo "Building KeyPears node for Linux x86_64..."

# Build KeyPears node for Linux with musl (static linking for Alpine)
cargo build --release --target x86_64-unknown-linux-musl -p node

echo "Copying binary to webapp/bin/..."

# Create bin directory in webapp
mkdir -p webapp/bin

# Copy the compiled binary
cp target/x86_64-unknown-linux-musl/release/keypears-node webapp/bin/keypears-node

# Make it executable
chmod +x webapp/bin/keypears-node

echo "✓ KeyPears node built successfully!"
echo "  Binary location: webapp/bin/keypears-node"
