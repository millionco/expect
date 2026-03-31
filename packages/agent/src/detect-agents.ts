import whichSync from "which";

export type SupportedAgent =
  | "claude"
  | "codex"
  | "copilot"
  | "gemini"
  | "cursor"
  | "opencode"
  | "droid";

interface AgentMeta {
  readonly binary: string;
  readonly displayName: string;
  readonly skillDir: string;
}

const SUPPORTED_AGENTS: Record<SupportedAgent, AgentMeta> = {
  claude: { binary: "claude", displayName: "Claude Code", skillDir: ".claude/skills" },
  codex: { binary: "codex", displayName: "Codex", skillDir: ".codex/skills" },
  copilot: { binary: "copilot", displayName: "GitHub Copilot", skillDir: ".github/copilot/skills" },
  gemini: { binary: "gemini", displayName: "Gemini CLI", skillDir: ".gemini/skills" },
  cursor: { binary: "agent", displayName: "Cursor", skillDir: ".cursor/skills" },
  opencode: { binary: "opencode", displayName: "OpenCode", skillDir: ".opencode/skills" },
  droid: { binary: "droid", displayName: "Factory Droid", skillDir: ".droid/skills" },
};

export const isCommandAvailable = (command: string): boolean => {
  try {
    return Boolean(whichSync.sync(command));
  } catch {
    return false;
  }
};

export const detectAvailableAgents = (): SupportedAgent[] =>
  (Object.keys(SUPPORTED_AGENTS) as SupportedAgent[]).filter((agent) =>
    isCommandAvailable(SUPPORTED_AGENTS[agent].binary),
  );

export const toDisplayName = (agent: SupportedAgent): string => SUPPORTED_AGENTS[agent].displayName;

export const toSkillDir = (agent: SupportedAgent): string => SUPPORTED_AGENTS[agent].skillDir;
