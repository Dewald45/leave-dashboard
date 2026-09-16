#!/bin/sh
set -e

echo "[entrypoint] applying database schema + seed…"
node scripts/migrate.mjs

echo "[entrypoint] starting Next.js server…"
exec node server.js
