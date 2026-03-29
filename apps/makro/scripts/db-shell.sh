#!/bin/sh

set -eu

docker compose exec postgres psql -U makro -d makro
