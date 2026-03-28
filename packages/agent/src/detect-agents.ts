import { execSync } from "node:child_process";

export type SupportedAgent = "claude" | "codex" | "copilot" | "gemini" | "cursor";

const SUPPORTED_AGENTS: readonly SupportedAgent[] = [
  "claude",
  "codex",
  "copilot",
  "gemini",
  "cursor",
];

const WHICH_COMMAND = process.platform === "win32" ? "where" : "which";

const isCommandAvailable = (command: string): boolean => {
  try {
    execSync(`${WHICH_COMMAND} ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

export const detectAvailableAgents = (): SupportedAgent[] =>
  SUPPORTED_AGENTS.filter(isCommandAvailable);
