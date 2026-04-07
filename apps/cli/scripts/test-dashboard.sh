#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node dist/index.js \
  -u https://gym.ami.construction/dashboard \
  -m "Test the dashboard. Click around, check that pages load, verify navigation works, and look for any broken UI or errors." \
  -y
