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

# Start webapp in background (not foreground)
echo "Starting webapp on port 4273..."
pnpm run start &
WEBAPP_PID=$!

# Give webapp a moment to start
sleep 2

# Check if webapp is still running
if ! kill -0 $WEBAPP_PID 2>/dev/null; then
    echo "ERROR: Webapp failed to start"
    kill $API_PID 2>/dev/null || true
    exit 1
fi

echo "Webapp started successfully (PID: $WEBAPP_PID)"
echo "Both services running. Monitoring for crashes..."

# Monitor both processes - exit if either dies
while true; do
    if ! kill -0 $API_PID 2>/dev/null; then
        echo "ERROR: API server crashed (PID: $API_PID)"
        kill $WEBAPP_PID 2>/dev/null || true
        exit 1
    fi

    if ! kill -0 $WEBAPP_PID 2>/dev/null; then
        echo "ERROR: Webapp crashed (PID: $WEBAPP_PID)"
        kill $API_PID 2>/dev/null || true
        exit 1
    fi

    sleep 5
done
