#!/bin/sh

set -eu

docker compose exec -T postgres psql -U makro -d makro -f /workspace/supabase/verify.sql
