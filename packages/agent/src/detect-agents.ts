import { isCommandAvailable } from "@expect/shared/is-command-available";

export type SupportedAgent =
  | "claude"
  | "codex"
  | "copilot"
  | "gemini"
  | "cursor"
  | "opencode"
  | "droid";

interface AgentMeta {
  readonly binaries: readonly string[];
  readonly displayName: string;
  readonly skillDir: string;
}

const SUPPORTED_AGENTS: Record<SupportedAgent, AgentMeta> = {
  claude: { binaries: ["claude"], displayName: "Claude Code", skillDir: ".claude/skills" },
  codex: { binaries: ["codex"], displayName: "Codex", skillDir: ".codex/skills" },
  copilot: {
    binaries: ["copilot"],
    displayName: "GitHub Copilot",
    skillDir: ".github/copilot/skills",
  },
  gemini: { binaries: ["gemini"], displayName: "Gemini CLI", skillDir: ".gemini/skills" },
  cursor: { binaries: ["cursor", "agent"], displayName: "Cursor", skillDir: ".cursor/skills" },
  opencode: { binaries: ["opencode"], displayName: "OpenCode", skillDir: ".opencode/skills" },
  droid: { binaries: ["droid"], displayName: "Factory Droid", skillDir: ".droid/skills" },
};

export const detectAvailableAgents = (): SupportedAgent[] =>
  (Object.keys(SUPPORTED_AGENTS) as SupportedAgent[]).filter((agent) =>
    SUPPORTED_AGENTS[agent].binaries.some(isCommandAvailable),
  );

export const toDisplayName = (agent: SupportedAgent): string => SUPPORTED_AGENTS[agent].displayName;

export const toSkillDir = (agent: SupportedAgent): string => SUPPORTED_AGENTS[agent].skillDir;
