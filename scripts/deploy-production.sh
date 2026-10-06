#!/usr/bin/env bash
# Run ON the production server (aaPanel / SSH):
#   cd /www/wwwroot/onevibe.walit.in/onevibe_backend && bash scripts/deploy-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pull latest"
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> Install deps"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Migrate DB"
npm run db:migrate

echo "==> Build"
npm run build

echo "==> Restart processes"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart onevibe-api --update-env || pm2 restart all --update-env
  pm2 restart onevibe-socket --update-env 2>/dev/null || true
  pm2 save || true
  pm2 status
else
  echo "PM2 not found — restart the API process manually (port 3018)."
fi

echo "==> Done. Verify: https://onevibe.walit.in/docs"
echo "    Feed description should mention viewer flags."
