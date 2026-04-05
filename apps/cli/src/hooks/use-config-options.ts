import { useQuery } from "@tanstack/react-query";
import { Effect } from "effect";
import { Agent, type AgentBackend } from "@expect/agent";
import type { AcpConfigOption } from "@expect/shared/models";
import { layerCli } from "../layers";

export const useConfigOptions = (agent: AgentBackend | undefined) =>
  useQuery({
    queryKey: ["config-options", agent],
    enabled: agent !== undefined,
    queryFn: () => {
      if (!agent) return Promise.resolve([] as readonly AcpConfigOption[]);
      return Effect.runPromise(
        Effect.gen(function* () {
          const agentService = yield* Agent;
          return yield* agentService.fetchConfigOptions(process.cwd());
        }).pipe(
          Effect.provide(layerCli({ verbose: false, agent })),
          Effect.scoped,
          Effect.catchTags({
            AcpSessionCreateError: () => Effect.succeed([] as readonly AcpConfigOption[]),
            AcpProviderUnauthenticatedError: () => Effect.succeed([] as readonly AcpConfigOption[]),
            AcpProviderUsageLimitError: () => Effect.succeed([] as readonly AcpConfigOption[]),
          }),
        ),
      );
    },
    staleTime: 60_000,
    retry: false,
  });
