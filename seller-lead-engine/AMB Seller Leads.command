#!/bin/sh
# Opens the AMB Seller Leads app on a Mac: double-click this file. Keep the
# Terminal window open while you use the app; close it to stop.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js is missing: install the LTS version from https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install || exit 1
exec npm run engine -- app
