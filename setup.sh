#!/usr/bin/env bash
# PROJECT AVENGERS one-click setup (Mac/Linux): bash setup.sh
set -e
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org, then rerun."; exit 1; }
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/amb-material-bot"
npm install
[ -f .env ] || cp .env.example .env
[ -f requests/live-requests.csv ] || cp requests/high-priority-requests.csv requests/live-requests.csv
npm run demo
echo "Done. Add ANTHROPIC_API_KEY to amb-material-bot/.env; drop templates in references/model-templates and CIMs in references/cims."
open references 2>/dev/null || true

# Seller lead engine: install, copy the example settings if missing, run the offline demo.
cd "$ROOT/seller-lead-engine"
npm install
[ -f .env ] || cp .env.example .env
mkdir -p config
[ -f config/engine.config.json ] || cp config/engine.config.example.json config/engine.config.json
npm run demo
echo "Seller lead engine ready. Fill in seller-lead-engine/config/engine.config.json and .env, then read seller-lead-engine/docs/RUNBOOK.md. Nothing is sent until the licensing sign-off and postal address are filled in."
