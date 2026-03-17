import type { AgentProvider, EnvironmentOverrides, TestAction } from "@browser-tester/supervisor";

export type { EnvironmentOverrides } from "@browser-tester/supervisor";

export interface TestRunConfig {
  action: TestAction;
  commitHash?: string;
  message?: string;
  flowSlug?: string;
  autoRun?: boolean;
  planningProvider?: AgentProvider;
  executionProvider?: AgentProvider;
  planningModel?: string;
  executionModel?: string;
  environmentOverrides?: EnvironmentOverrides;
}

interface CommanderGlobalOptions {
  message?: string;
  flow?: string;
  yes?: boolean;
  planner?: AgentProvider;
  executor?: AgentProvider;
  planningModel?: string;
  executionModel?: string;
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export const resolveTestRunConfig = (
  action: TestAction,
  commanderOptions: CommanderGlobalOptions,
  commitHash?: string,
): TestRunConfig => {
  const { baseUrl, headed, cookies, planner, executor, planningModel, executionModel } =
    commanderOptions;
  const hasEnvironmentOverrides =
    baseUrl !== undefined || headed !== undefined || cookies !== undefined;

  return {
    action,
    commitHash,
    message: commanderOptions.message,
    flowSlug: commanderOptions.flow,
    autoRun: commanderOptions.yes,
    planningProvider: planner,
    executionProvider: executor,
    planningModel,
    executionModel,
    environmentOverrides: hasEnvironmentOverrides ? { baseUrl, headed, cookies } : undefined,
  };
};
