#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
BROWSER_PKG="../../packages/browser"

echo "Building runtime CSS..."
(cd "$BROWSER_PKG" && pnpm build:css)

echo "Building runtime JS..."
(cd "$BROWSER_PKG" && node scripts/build-runtime.js)

echo "Extracting runtime..."
node -e "
  const fs = require('fs');
  const src = fs.readFileSync('$BROWSER_PKG/src/generated/runtime-script.ts', 'utf-8');
  const match = src.match(/export const RUNTIME_SCRIPT = (.*);/s);
  if (!match) { console.error('Failed to extract runtime'); process.exit(1); }
  fs.writeFileSync('public/runtime.js', JSON.parse(match[1]));
  console.log('Written public/runtime.js (' + fs.statSync('public/runtime.js').size + ' bytes)');
"
