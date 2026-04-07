#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CLI_BIN="$(cd ../cli && pwd)/dist/index.js"

node "$CLI_BIN" \
  -u http://localhost:5173 \
  --browser-mode headed \
  -m "Log in as any user. Create a new post. Like a post. Click into a post and leave a reply. Visit a user profile. Delete your own post. Verify everything works." \
  -y
