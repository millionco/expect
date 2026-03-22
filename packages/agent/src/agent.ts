import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, FileSystem, Layer, Option, ServiceMap, Stream } from "effect";
import {
  AcpAdapter,
  AcpClient,
  type AcpSessionCreateError,
  type AcpStreamError,
  type SessionId,
} from "./acp-client.js";
import { ClaudeProvider } from "./claude-provider.js";
import { CodexProvider } from "./codex-provider.js";
import { CurrentModel } from "./current-model.js";
import { ClaudeQueryError, CodexRunError } from "./errors.js";
import { AgentStreamOptions } from "./types.js";
import { NodeServices } from "@effect/platform-node";

export type AgentBackend = "claude" | "codex";

export class Agent extends ServiceMap.Service<
  Agent,
  {
    readonly stream: (
      options: AgentStreamOptions
    ) => Stream.Stream<
      LanguageModelV3StreamPart,
      ClaudeQueryError | CodexRunError | AcpStreamError | AcpSessionCreateError
    >;
    readonly createSession: (
      cwd: string
    ) => Effect.Effect<SessionId, AcpSessionCreateError>;
  }
>()("@browser-tester/Agent") {
  static layerClaude = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* ClaudeProvider;
      return Agent.of({
        stream: (options) => provider.stream(options),
        createSession: () =>
          Effect.die("createSession not supported for ClaudeProvider"),
      });
    })
  ).pipe(
    Layer.provide(ClaudeProvider.layer),
    Layer.provide(CurrentModel.layerClaude)
  );

  static layerCodex = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* CodexProvider;
      return Agent.of({
        stream: (options) => provider.stream(options),
        createSession: () =>
          Effect.die("createSession not supported for CodexProvider"),
      });
    })
  ).pipe(
    Layer.provide(CodexProvider.layer),
    Layer.provide(CurrentModel.layerCodex)
  );

  static layerAcp = Layer.effect(Agent)(
    Effect.gen(function* () {
      const acpClient = yield* AcpClient;

      return Agent.of({
        createSession: (cwd) => acpClient.createSession(cwd),
        stream: (options) =>
          acpClient
            .stream({
              cwd: options.cwd,
              sessionId: Option.map(options.sessionId, (id) => id as SessionId),
              prompt: options.prompt,
            })
            .pipe(
              Stream.map((update) => update.streamParts),
              Stream.filter(Option.isSome),
              Stream.flatMap((option) => Stream.fromIterable(option.value))
            ),
      });
    })
  ).pipe(Layer.provide(AcpClient.layer));

  static layerAcpCodex = Agent.layerAcp.pipe(
    Layer.provide(AcpAdapter.layerCodex)
  );
  static layerAcpClaude = Agent.layerAcp.pipe(
    Layer.provide(AcpAdapter.layerClaude)
  );

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
              Stream.map(
                (line) => JSON.parse(line) as LanguageModelV3StreamPart
              ),
              Stream.orDie
            ),
          createSession: () =>
            Effect.die("createSession not supported for test layer"),
        });
      })
    ).pipe(Layer.provide(NodeServices.layer));
}
