#!/usr/bin/env bash
# PROJECT AVENGERS one-click setup (Mac/Linux): bash setup.sh
set -e
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org, then rerun."; exit 1; }
cd "$(dirname "$0")/amb-material-bot"
npm install
[ -f .env ] || cp .env.example .env
[ -f requests/live-requests.csv ] || cp requests/high-priority-requests.csv requests/live-requests.csv
npm run demo
echo "Done. Add ANTHROPIC_API_KEY to amb-material-bot/.env; drop templates in references/model-templates and CIMs in references/cims."
open references 2>/dev/null || true
