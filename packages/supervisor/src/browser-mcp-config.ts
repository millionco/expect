import * as url from "node:url";
import {
  BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME,
  BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME,
} from "@browser-tester/browser/mcp";
import { DEFAULT_BROWSER_MCP_SERVER_NAME } from "./constants";
import type { AgentProviderSettings, McpServerConfig } from "@browser-tester/agent";

export const getBrowserMcpEntrypoint = (): string =>
  url.fileURLToPath(import.meta.resolve("@browser-tester/browser/cli"));

export const buildBrowserMcpServerEnv = (options: {
  replayOutputPath?: string;
  liveViewUrl?: string;
}): Record<string, string> | undefined => {
  const env: Record<string, string> = {};
  if (options.replayOutputPath) {
    env[BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME] = options.replayOutputPath;
  }
  if (options.liveViewUrl) {
    env[BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME] = options.liveViewUrl;
  }
  return Object.keys(env).length > 0 ? env : undefined;
};

const buildBrowserTesterMcpServerConfig = (
  serverEnv: Record<string, string> | undefined,
): McpServerConfig => ({
  type: "stdio",
  command: process.execPath,
  args: [getBrowserMcpEntrypoint()],
  ...(serverEnv ? { env: serverEnv } : {}),
});

export const buildBrowserMcpSettings = (options: {
  providerSettings?: AgentProviderSettings;
  browserMcpServerName?: string;
  replayOutputPath?: string;
  liveViewUrl?: string;
}): AgentProviderSettings => {
  const browserMcpServerName = options.browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;
  const serverEnv = buildBrowserMcpServerEnv({
    replayOutputPath: options.replayOutputPath,
    liveViewUrl: options.liveViewUrl,
  });
  const existingBrowserServerConfig = options.providerSettings?.mcpServers?.[browserMcpServerName];
  const resolvedBrowserServerConfig = buildBrowserTesterMcpServerConfig(serverEnv);

  return {
    ...options.providerSettings,
    mcpServers: {
      [browserMcpServerName]: {
        ...existingBrowserServerConfig,
        ...resolvedBrowserServerConfig,
        ...(existingBrowserServerConfig?.env || resolvedBrowserServerConfig.env
          ? {
              env: {
                ...existingBrowserServerConfig?.env,
                ...resolvedBrowserServerConfig.env,
              },
            }
          : {}),
      },
    },
  };
};
