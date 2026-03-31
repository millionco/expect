import type { AgentProvider } from "@expect/shared/models";

interface BuildSessionMetaOptions {
  readonly provider: AgentProvider;
  readonly systemPrompt?: string;
  readonly metadata?: {
    readonly isGitHubActions?: boolean;
  };
}

export const buildSessionMeta = ({ provider, systemPrompt, metadata }: BuildSessionMetaOptions) => {
  const meta = {
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(metadata?.isGitHubActions && provider === "claude"
      ? {
          claudeCode: {
            options: {
              effort: "high" as const,
              thinking: { type: "adaptive" as const },
            },
          },
        }
      : {}),
  };

  if (Object.keys(meta).length === 0) return undefined;
  return meta;
};
