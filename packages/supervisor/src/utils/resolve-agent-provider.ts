import { Effect } from "effect";
import type { AgentProvider } from "../types";
import { commandExists } from "./command-exists";

const AUTO_PROVIDER_ORDER: readonly AgentProvider[] = ["codex", "claude", "cursor"];

const getProviderDisplayName = (provider: AgentProvider): string => {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  return "Cursor";
};

const getProviderExecutable = (provider: AgentProvider): string | undefined => {
  if (provider === "codex") return "codex";
  if (provider === "cursor") return "cursor-agent";
  return undefined;
};

const isProviderAvailable = Effect.fn("isProviderAvailable")(function* (provider: AgentProvider) {
  const executable = getProviderExecutable(provider);

  if (!executable) return true;

  return yield* Effect.tryPromise({
    try: () => commandExists(executable),
    catch: () => false,
  });
});

const getUnavailableProviderMessage = (provider: AgentProvider): string => {
  const executable = getProviderExecutable(provider);

  if (executable) {
    return [
      `${getProviderDisplayName(provider)} is not available on this machine.`,
      `Install or enable \`${executable}\`, or choose a different agent.`,
    ].join(" ");
  }

  return `${getProviderDisplayName(provider)} is not available on this machine. Choose a different agent.`;
};

export interface ResolvedAgentProvider {
  provider: AgentProvider;
  fallbackProviders: AgentProvider[];
  explicit: boolean;
}

export const resolveAgentProvider = Effect.fn("resolveAgentProvider")(function* (
  provider?: AgentProvider,
) {
  if (provider) {
    const available = yield* isProviderAvailable(provider);

    if (!available) {
      return yield* Effect.fail(new Error(getUnavailableProviderMessage(provider)));
    }

    return {
      provider,
      fallbackProviders: [],
      explicit: true,
    } satisfies ResolvedAgentProvider;
  }

  const availabilityChecks = yield* Effect.forEach(
    AUTO_PROVIDER_ORDER,
    (candidateProvider) =>
      isProviderAvailable(candidateProvider).pipe(
        Effect.map((available) => ({
          provider: candidateProvider,
          available,
        })),
      ),
    { concurrency: "unbounded" },
  );

  const availableProviders = availabilityChecks
    .filter((availabilityCheck) => availabilityCheck.available)
    .map((availabilityCheck) => availabilityCheck.provider);

  if (availableProviders.length === 0) {
    return yield* Effect.fail(
      new Error(
        [
          "No supported implementation agent is available.",
          "Install or enable Codex, Claude Code, or Cursor.",
        ].join(" "),
      ),
    );
  }

  return {
    provider: availableProviders[0],
    fallbackProviders: availableProviders.slice(1),
    explicit: false,
  } satisfies ResolvedAgentProvider;
});
