import { useQuery } from "@tanstack/react-query";
import { Effect } from "effect";
import { Agent, type AgentBackend } from "@expect/agent";
import type { AcpConfigOption } from "@expect/shared/models";
import * as NodeServices from "@effect/platform-node/NodeServices";

export const useConfigOptions = (agent: AgentBackend) =>
  useQuery({
    queryKey: ["config-options", agent],
    queryFn: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const agentService = yield* Agent;
          return yield* agentService.fetchConfigOptions(process.cwd());
        }).pipe(
          Effect.provide(Agent.layerFor(agent)),
          Effect.provide(NodeServices.layer),
          Effect.orDie,
        ),
      ),
    staleTime: 60_000,
    retry: false,
  });
