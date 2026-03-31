#!/usr/bin/env bash
# Reads browser-relevant skills from .agents/skills/ and generates a TypeScript
# module with their content inlined as string constants.
#
# Output: packages/shared/src/evaluation-skills.generated.ts

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/.agents/skills"
OUTPUT="$REPO_ROOT/packages/shared/src/evaluation-skills.generated.ts"

# Only skills relevant to runtime browser evaluation.
SKILLS=(fixing-accessibility fixing-seo web-design-guidelines)

strip_frontmatter() {
  awk 'BEGIN{n=0} /^---$/{n++; if(n==2){found=1; next}} found{print}' "$1"
}

# Escape backticks and backslashes for template literal embedding.
escape_for_template() {
  sed 's/\\/\\\\/g; s/`/\\`/g; s/\$/\\$/g'
}

cat > "$OUTPUT" <<'HEADER'
// AUTO-GENERATED — do not edit by hand.
// Regenerate with: ./scripts/generate-evaluation-skills.sh

export interface EvaluationSkill {
  readonly name: string;
  readonly content: string;
}

export const EVALUATION_SKILLS: readonly EvaluationSkill[] = [
HEADER

for skill in "${SKILLS[@]}"; do
  FILE="$SKILLS_DIR/$skill/SKILL.md"
  if [ ! -f "$FILE" ]; then
    echo "WARNING: $FILE not found, skipping" >&2
    continue
  fi

  BODY=$(strip_frontmatter "$FILE" | escape_for_template)

  cat >> "$OUTPUT" <<EOF
  {
    name: "$skill",
    content: \`$BODY\`,
  },
EOF
done

cat >> "$OUTPUT" <<'FOOTER'
];
FOOTER

echo "Generated $OUTPUT (${#SKILLS[@]} skills)"
