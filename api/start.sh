#!/bin/sh
set -eu

POT_LOG=/tmp/bgutil-pot.log

# Start the YouTube PO-token provider in the background.
node /opt/bgutil-ytdlp-pot-provider/server/build/main.js \
  --host 127.0.0.1 \
  --port 4416 >"$POT_LOG" 2>&1 &
POT_PID=$!

cleanup() {
  kill "$POT_PID" 2>/dev/null || true
  wait "$POT_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Give the local provider a short head start, without blocking API startup.
i=0
while [ "$i" -lt 20 ]; do
  if kill -0 "$POT_PID" 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.1
done

exec node server.js
