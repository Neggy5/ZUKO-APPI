#!/bin/sh
set -u

echo "[startup] ZUKO API boot"
echo "[startup] node=$(node --version)"
echo "[startup] port=${PORT:-3000}"

# The Save-Tube downloader is the primary YouTube path. Start bgutil in the
# background for yt-dlp fallback support, but never prevent the API itself
# from starting if the helper has a transient startup problem.
node /opt/bgutil-ytdlp-pot-provider/server/build/main.js   --host 127.0.0.1 --port 4416 > /tmp/bgutil.log 2>&1 &
POT_PID=$!
echo "[startup] bgutil pid=$POT_PID"

sleep 1
if kill -0 "$POT_PID" 2>/dev/null; then
  echo "[startup] bgutil started"
else
  echo "[startup] bgutil did not stay running; continuing with API"
  cat /tmp/bgutil.log 2>/dev/null || true
fi

echo "[startup] starting server.js"
exec node server.js
