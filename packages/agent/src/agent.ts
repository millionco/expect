import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, FileSystem, Layer, Schema, ServiceMap, Stream } from "effect";
import { ClaudeProvider } from "./claude-provider.js";
import { CodexProvider } from "./codex-provider.js";
import { CurrentModel } from "./current-model.js";
import { ClaudeQueryError, CodexRunError } from "./errors.js";
import { AgentStreamOptions } from "./types.js";
import { NodeServices } from "@effect/platform-node";

type AgentBackend = "claude" | "codex";

const FIXTURE_EMIT_INTERVAL_MS = 10;

export class Agent extends ServiceMap.Service<
  Agent,
  {
    readonly stream: (
      options: AgentStreamOptions,
    ) => Stream.Stream<LanguageModelV3StreamPart, ClaudeQueryError | CodexRunError>;
  }
>()("@browser-tester/Agent") {
  static layerClaude = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* ClaudeProvider;
      return Agent.of({
        stream: (options) => provider.stream(options),
      });
    }),
  ).pipe(Layer.provide(ClaudeProvider.layer), Layer.provide(CurrentModel.layerClaude));

  static layerCodex = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* CodexProvider;
      return Agent.of({
        stream: (options) => provider.stream(options),
      });
    }),
  ).pipe(Layer.provide(CodexProvider.layer), Layer.provide(CurrentModel.layerCodex));

  static layerFor = (backend: AgentBackend) =>
    backend === "claude" ? Agent.layerClaude : Agent.layerCodex;

  static layerTest = (fixturePath: string) =>
    Layer.effect(
      Agent,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        return Agent.of({
          stream: () =>
            fs.stream(fixturePath).pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.map((line) => JSON.parse(line) as LanguageModelV3StreamPart),
              Stream.orDie,
            ),
        });
      }),
    ).pipe(Layer.provide(NodeServices.layer));
}
