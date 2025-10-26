#!/bin/sh
set -e

echo "Starting KeyPears services..."

# Start KeyPears node in background
echo "Starting KeyPears node on port 4274..."
/app/bin/keypears-node &
NODE_PID=$!

# Give node a moment to start
sleep 2

# Check if node is still running
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo "ERROR: KeyPears node failed to start"
    exit 1
fi

echo "KeyPears node started successfully (PID: $NODE_PID)"

# Start webapp in background (not foreground)
echo "Starting webapp on port 4273..."
pnpm run start &
WEBAPP_PID=$!

# Give webapp a moment to start
sleep 2

# Check if webapp is still running
if ! kill -0 $WEBAPP_PID 2>/dev/null; then
    echo "ERROR: Webapp failed to start"
    kill $NODE_PID 2>/dev/null || true
    exit 1
fi

echo "Webapp started successfully (PID: $WEBAPP_PID)"
echo "Both services running. Monitoring for crashes..."

# Monitor both processes - exit if either dies
while true; do
    if ! kill -0 $NODE_PID 2>/dev/null; then
        echo "ERROR: KeyPears node crashed (PID: $NODE_PID)"
        kill $WEBAPP_PID 2>/dev/null || true
        exit 1
    fi

    if ! kill -0 $WEBAPP_PID 2>/dev/null; then
        echo "ERROR: Webapp crashed (PID: $WEBAPP_PID)"
        kill $NODE_PID 2>/dev/null || true
        exit 1
    fi

    sleep 5
done
