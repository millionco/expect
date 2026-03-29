#!/usr/bin/env bash
set -euo pipefail

# Agent detection mirroring packages/agent/src/detect-agents.ts
# Maps our SupportedAgent names to skills CLI agent names
declare -A AGENT_BINARIES=(
  [claude]=claude
  [codex]=codex
  [copilot]=copilot
  [gemini]=gemini
  [cursor]=agent
  [opencode]=opencode
  [droid]=droid
)

declare -A SKILLS_CLI_NAMES=(
  [claude]=claude-code
  [codex]=codex
  [copilot]=github-copilot
  [gemini]=gemini-cli
  [cursor]=cursor
  [opencode]=opencode
  [droid]=droid
)

WHICH_CMD="/usr/bin/which"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  WHICH_CMD="where"
fi

detected_agents=()
for agent in claude codex copilot gemini cursor opencode droid; do
  if $WHICH_CMD "${AGENT_BINARIES[$agent]}" &>/dev/null; then
    detected_agents+=("$agent")
  fi
done

if [[ ${#detected_agents[@]} -eq 0 ]]; then
  echo "No supported agents detected, skipping skills install."
  exit 0
fi

skills_agents=()
for agent in "${detected_agents[@]}"; do
  skills_agents+=("${SKILLS_CLI_NAMES[$agent]}")
done

echo "Detected agents: ${detected_agents[*]}"
echo "Installing skills for: ${skills_agents[*]}"

if [[ $# -eq 0 ]]; then
  echo "Usage: pnpm skills:install <source> [source...]" >&2
  echo "Example: pnpm skills:install vercel-labs/agent-skills" >&2
  exit 1
fi

for source in "$@"; do
  echo ""
  echo "Installing skills from $source..."
  npx skills add "$source" --agent "${skills_agents[@]}" -y
done
