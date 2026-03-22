#!/usr/bin/env node
import { Effect, Layer, Logger, References } from "effect";
import { NodeServices } from "@effect/platform-node";
import { AcpServer } from "./server.js";
import type { AgentBackend } from "./agent.js";

const agentBackend: AgentBackend = process.argv.includes("--codex") ? "codex" : "claude";

const mainLayer = Layer.mergeAll(AcpServer.layerFor(agentBackend), NodeServices.layer).pipe(
  Layer.provideMerge(Logger.layer([Logger.defaultLogger])),
  Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Info")),
);

const program = Effect.gen(function* () {
  yield* Effect.logInfo("ACP agent starting", { agentBackend });
  const server = yield* AcpServer;
  yield* server.serve;
}).pipe(Effect.provide(mainLayer));

Effect.runFork(program);
