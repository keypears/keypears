#!/bin/bash
# Wrapper script to run Tauri dev with configurable PORT
# Usage: PORT=3010 ./tauri-dev.sh -- -- --db-path ./keypears-1.db

set -e

# Get port from environment or default to 1420
export PORT="${PORT:-1420}"

# Clean up React Router cache
rm -rf .react-router

# Set environment variables
export KEYPEARS_ENV=development

# Run Tauri dev with port override
tauri dev --config "{\"build\":{\"devUrl\":\"http://localhost:${PORT}\"}}" "$@"
