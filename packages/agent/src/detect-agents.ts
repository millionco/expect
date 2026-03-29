import { execSync } from "node:child_process";

export type SupportedAgent =
  | "claude"
  | "codex"
  | "copilot"
  | "gemini"
  | "cursor"
  | "opencode"
  | "droid";

const SUPPORTED_AGENTS: readonly SupportedAgent[] = [
  "claude",
  "codex",
  "copilot",
  "gemini",
  "cursor",
  "opencode",
  "droid",
];

const AGENT_BINARY_NAMES: Record<SupportedAgent, string> = {
  claude: "claude",
  codex: "codex",
  copilot: "copilot",
  gemini: "gemini",
  cursor: "agent",
  opencode: "opencode",
  droid: "droid",
};

export const AGENT_SKILLS_CLI_NAMES: Record<SupportedAgent, string> = {
  claude: "claude-code",
  codex: "codex",
  copilot: "github-copilot",
  gemini: "gemini-cli",
  cursor: "cursor",
  opencode: "opencode",
  droid: "droid",
};

const WHICH_COMMAND = process.platform === "win32" ? "where" : "/usr/bin/which";

const isCommandAvailable = (command: string): boolean => {
  try {
    execSync(`${WHICH_COMMAND} ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

export const detectAvailableAgents = (): SupportedAgent[] =>
  SUPPORTED_AGENTS.filter((agent) => isCommandAvailable(AGENT_BINARY_NAMES[agent]));
