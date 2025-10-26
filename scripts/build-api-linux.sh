#!/bin/bash
set -e

echo "Building KeyPears node for Linux x86_64..."

# Build KeyPears node for Linux with musl (static linking for Alpine)
cargo build --release --target x86_64-unknown-linux-musl -p node

echo "Copying binary to ts-webapp/bin/..."

# Create bin directory in ts-webapp
mkdir -p ts-webapp/bin

# Copy the compiled binary
cp target/x86_64-unknown-linux-musl/release/keypears-node ts-webapp/bin/keypears-node

# Make it executable
chmod +x ts-webapp/bin/keypears-node

echo "✓ KeyPears node built successfully!"
echo "  Binary location: ts-webapp/bin/keypears-node"
