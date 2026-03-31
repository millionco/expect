#!/usr/bin/env bash
# Syncs .agents/skills/expect/SKILL.md → packages/expect-skill/SKILL.md
#
# .agents/ is the source of truth. The packages/ copy adds extra frontmatter
# fields (license, metadata) required by the npm package.
#
# Usage:
#   ./scripts/sync-skill.sh          # overwrite packages/ from .agents/
#   ./scripts/sync-skill.sh --check  # exit 1 if they have drifted

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$REPO_ROOT/.agents/skills/expect/SKILL.md"
TARGET="$REPO_ROOT/packages/expect-skill/SKILL.md"

# Extract body (everything after the closing ---) from a SKILL.md
body() {
  awk 'BEGIN{n=0} /^---$/{n++; if(n==2){found=1; next}} found{print}' "$1"
}

if [ "${1:-}" = "--check" ]; then
  SOURCE_BODY=$(body "$SOURCE")
  TARGET_BODY=$(body "$TARGET")
  if [ "$SOURCE_BODY" != "$TARGET_BODY" ]; then
    echo "ERROR: SKILL.md files are out of sync." >&2
    echo "  source: .agents/skills/expect/SKILL.md" >&2
    echo "  target: packages/expect-skill/SKILL.md" >&2
    echo "" >&2
    echo "Run ./scripts/sync-skill.sh to fix." >&2
    exit 1
  fi
  echo "SKILL.md files are in sync."
  exit 0
fi

# --- Sync mode: rebuild packages/ SKILL.md ---

# Keep the packages/ frontmatter (has license + metadata), swap in the body
# from .agents/.
TARGET_FRONTMATTER=$(awk 'BEGIN{n=0} /^---$/{n++; if(n==2){print; exit}} {print}' "$TARGET")
SOURCE_BODY=$(body "$SOURCE")

printf '%s\n%s\n' "$TARGET_FRONTMATTER" "$SOURCE_BODY" > "$TARGET"

echo "Synced .agents/skills/expect/SKILL.md → packages/expect-skill/SKILL.md"
