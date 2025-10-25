#!/bin/bash
set -e

echo "Setting up cross-compilation for Linux x86_64..."

# Add Rust target for Linux x86_64 with musl (static linking)
echo "Adding Rust target..."
rustup target add x86_64-unknown-linux-musl

# Install musl-cross toolchain via Homebrew
echo "Installing musl-cross toolchain..."
brew install filosottile/musl-cross/musl-cross

echo "✓ Cross-compilation setup complete!"
echo "You can now build the API server for Linux using: pnpm build:api"
