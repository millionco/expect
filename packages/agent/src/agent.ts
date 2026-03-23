import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, FileSystem, Layer, Option, ServiceMap, Stream } from "effect";
import {
  AcpAdapter,
  AcpClient,
  type AcpSessionCreateError,
  type AcpStreamError,
  type SessionId,
} from "./acp-client.js";
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
      AcpStreamError | AcpSessionCreateError
    >;
    readonly createSession: (
      cwd: string
    ) => Effect.Effect<SessionId, AcpSessionCreateError>;
  }
>()("@browser-tester/Agent") {
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
              Stream.flatMap((option) => Stream.fromIterable(option.value)),
              Stream.tap((x) => {
                if (x.type === "text-delta") {
                  console.error(x.delta);
                }
                if (x.type === "tool-call") {
                  console.error(x);
                }
                return Effect.void;
              })
            ),
      });
    })
  ).pipe(Layer.provide(AcpClient.layer));

  static layerCodex = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCodex));
  static layerClaude = Agent.layerAcp.pipe(
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
