import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, ServiceMap, Stream } from "effect";
import { ClaudeProvider } from "./claude-provider.js";
import { CodexProvider } from "./codex-provider.js";
import { CurrentModel } from "./current-model.js";
import { ClaudeQueryError, CodexRunError } from "./errors.js";
import { AgentStreamOptions } from "./types.js";

type AgentBackend = "claude" | "codex";

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
  ).pipe(
    Layer.provide(ClaudeProvider.layer),
    Layer.provide(CurrentModel.layerClaude),
  );

  static layerCodex = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* CodexProvider;
      return Agent.of({
        stream: (options) => provider.stream(options),
      });
    }),
  ).pipe(
    Layer.provide(CodexProvider.layer),
    Layer.provide(CurrentModel.layerCodex),
  );

  static layerFor = (backend: AgentBackend) =>
    backend === "claude" ? Agent.layerClaude : Agent.layerCodex;
}
