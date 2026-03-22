import { Effect, Layer, Logger, References } from "effect";
import { NodeServices } from "@effect/platform-node";
import { AcpServer, type AgentBackend } from "../acp/index.js";

export const runAcp = async (agentBackend: AgentBackend): Promise<void> => {
  const mainLayer = Layer.mergeAll(AcpServer.layerFor(agentBackend), NodeServices.layer).pipe(
    Layer.provideMerge(Logger.layer([Logger.defaultLogger])),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Info")),
  );

  const program = Effect.gen(function* () {
    yield* Effect.logInfo("ACP agent starting", { agentBackend });
    const server = yield* AcpServer;
    yield* server.serve;
  });

  await Effect.runPromise(program.pipe(Effect.provide(mainLayer)));
};
