import type { FileStat } from "@browser-tester/shared/models";

export type { FileStat };

export type AgentProvider = "claude" | "codex" | "cursor";

export interface BrowserEnvironmentHints {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export interface EnvironmentOverrides {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export interface TestRunConfig {
  action: "unstaged" | "branch" | "changes" | "commit";
  commitHash?: string;
  flowSlug?: string;
  message?: string;
  executionProvider?: AgentProvider;
  executionModel?: string;
  environmentOverrides?: EnvironmentOverrides;
}

interface CommanderGlobalOptions {
  flow?: string;
  message?: string;
  executor?: AgentProvider;
  executionModel?: string;
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export const resolveTestRunConfig = (
  action: TestRunConfig["action"],
  commanderOptions: CommanderGlobalOptions,
  commitHash?: string,
): TestRunConfig => {
  const { baseUrl, headed, cookies, executor, executionModel } = commanderOptions;
  const hasEnvironmentOverrides =
    baseUrl !== undefined || headed !== undefined || cookies !== undefined;

  return {
    action,
    commitHash,
    flowSlug: commanderOptions.flow,
    message: commanderOptions.message,
    executionProvider: executor,
    executionModel,
    environmentOverrides: hasEnvironmentOverrides ? { baseUrl, headed, cookies } : undefined,
  };
};
