#!/usr/bin/env bash
# Start a cloudflared quick tunnel to the local backend and point both apps at
# it. Quick-tunnel hostnames change on every restart, so this script writes
# apps/*/.env.local (git-ignored) instead of editing App.tsx.
#
# Usage: npm run dev:tunnel          (Ctrl+C stops the tunnel and cleans up)
#        BACKEND_PORT=4000 npm run dev:tunnel
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${BACKEND_PORT:-4000}"
LOG="${TMPDIR:-/tmp}/parkpilot-cloudflared.log"
ENV_FILES=("$ROOT/apps/customer/.env.local" "$ROOT/apps/partner/.env.local")

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install it, or use LAN mode (no tunnel needed)." >&2
  exit 1
fi

if ! curl -sf -m 5 "http://localhost:$PORT/health" >/dev/null; then
  echo "Backend is not responding on http://localhost:$PORT/health." >&2
  echo "Start it first: npm run dev:backend" >&2
  exit 1
fi

: >"$LOG"
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!

cleanup() {
  kill "$TUNNEL_PID" 2>/dev/null || true
  rm -f "${ENV_FILES[@]}"
}
trap cleanup EXIT INT TERM

URL=""
for _ in $(seq 1 40); do
  URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -n1 || true)"
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "Tunnel did not come up. cloudflared log:" >&2
  cat "$LOG" >&2
  exit 1
fi

for file in "${ENV_FILES[@]}"; do
  printf 'EXPO_PUBLIC_API_URL=%s\n' "$URL" >"$file"
done

echo "Backend tunnel: $URL"
echo "Wrote EXPO_PUBLIC_API_URL to apps/{customer,partner}/.env.local"
echo "Restart Expo (Ctrl+C, then npx expo start) so the apps pick it up."
echo "Press Ctrl+C here to stop the tunnel."
wait "$TUNNEL_PID"
