import type { NewSessionMeta } from "@agentclientprotocol/claude-agent-acp";
import type { AgentProvider } from "@expect/shared/models";

const BROWSER_MCP_SERVER_NAME = "browser";

interface BuildSessionMetaOptions {
  readonly provider: AgentProvider;
  readonly systemPrompt?: string;
  readonly metadata?: {
    readonly isGitHubActions?: boolean;
  };
}

export const buildSessionMeta = ({ provider, systemPrompt, metadata }: BuildSessionMetaOptions) => {
  const meta: NewSessionMeta = {
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(provider === "claude"
      ? {
          claudeCode: {
            options: {
              tools: { type: "preset", preset: "claude_code" },
              settings: {
                allowedMcpServers: [{ serverName: BROWSER_MCP_SERVER_NAME }],
              },
              ...(metadata?.isGitHubActions && {
                effort: "high" as const,
                thinking: { type: "adaptive" as const },
              }),
            },
          },
        }
      : {}),
  };

  if (Object.keys(meta).length === 0) return undefined;
  return meta;
};
