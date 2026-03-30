import type { AgentProvider } from "@expect/shared/models";
import { Match, Option } from "effect";

interface BuildSessionMetaOptions {
  readonly provider: AgentProvider;
  readonly systemPrompt?: string;
  readonly metadata?: {
    readonly isGitHubActions?: boolean;
  };
}

export const buildSessionMeta = ({ provider, systemPrompt, metadata }: BuildSessionMetaOptions) =>
  Match.value(provider).pipe(
    Match.when("claude", () => {
      const systemPromptOption = Match.value(systemPrompt).pipe(
        Match.when(undefined, () => Option.none<string>()),
        Match.orElse((text) => Option.some(text)),
      );
      const claudeCodeOptionsOption = metadata?.isGitHubActions
        ? Option.some({
            effort: "high",
            thinking: { type: "adaptive" as const },
          })
        : Option.none();

      if (Option.isNone(systemPromptOption) && Option.isNone(claudeCodeOptionsOption)) {
        return undefined;
      }

      return {
        ...Option.match(systemPromptOption, {
          onNone: () => ({}),
          onSome: (text) => ({ systemPrompt: text }),
        }),
        ...Option.match(claudeCodeOptionsOption, {
          onNone: () => ({}),
          onSome: (options) => ({ claudeCode: { options } }),
        }),
      };
    }),
    Match.orElse(() => undefined),
  );
