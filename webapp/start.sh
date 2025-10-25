#!/bin/sh
set -e

echo "Starting KeyPears services..."

# Start API server in background
echo "Starting API server on port 4274..."
/app/bin/api-server &
API_PID=$!

# Give API server a moment to start
sleep 2

# Check if API server is still running
if ! kill -0 $API_PID 2>/dev/null; then
    echo "ERROR: API server failed to start"
    exit 1
fi

echo "API server started successfully (PID: $API_PID)"

# Start webapp in foreground
echo "Starting webapp on port 4273..."
exec pnpm run start
