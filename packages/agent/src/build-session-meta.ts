import type { AgentProvider } from "@expect/shared/models";

interface BuildSessionMetaOptions {
  readonly provider: AgentProvider;
  readonly systemPrompt?: string;
  readonly metadata?: {
    readonly isGitHubActions?: boolean;
  };
}

export const buildSessionMeta = ({ systemPrompt, metadata }: BuildSessionMetaOptions) => {
  return {
    /* we want github actions to have high effort. we are fine with waiting longer if it means we get a better answer. */
    ...(metadata?.isGitHubActions
      ? { effort: "high", thinking: { type: "adaptive" as const } }
      : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
  };
};
