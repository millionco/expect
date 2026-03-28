import { Config, Effect, FileSystem, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import {
  AcpAdapter,
  type AcpAdapterNotFoundError,
  AcpClient,
  type AcpConnectionInitError,
  type AcpProviderNotInstalledError,
  type AcpProviderUnauthenticatedError,
  type AcpProviderUsageLimitError,
  type AcpSessionCreateError,
  type AcpStreamError,
  type SessionId,
} from "./acp-client";
import { AcpSessionUpdate } from "@expect/shared/models";
import { AgentStreamOptions } from "./types";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PlatformError } from "effect/PlatformError";

type AgentLayerError =
  | PlatformError
  | Config.ConfigError
  | Schema.SchemaError
  | AcpProviderNotInstalledError
  | AcpProviderUnauthenticatedError
  | AcpConnectionInitError
  | AcpAdapterNotFoundError;

export type AgentBackend = "claude" | "codex" | "copilot" | "gemini" | "cursor";

export class Agent extends ServiceMap.Service<
  Agent,
  {
    readonly stream: (
      options: AgentStreamOptions,
    ) => Stream.Stream<
      AcpSessionUpdate,
      | AcpStreamError
      | AcpSessionCreateError
      | AcpProviderUnauthenticatedError
      | AcpProviderUsageLimitError
    >;
    readonly createSession: (
      cwd: string,
    ) => Effect.Effect<
      SessionId,
      AcpSessionCreateError | AcpProviderUnauthenticatedError | AcpProviderUsageLimitError
    >;
  }
>()("@expect/Agent") {
  static layerAcp = Layer.effect(Agent)(
    Effect.gen(function* () {
      const acpClient = yield* AcpClient;

      return Agent.of({
        createSession: (cwd) => acpClient.createSession(cwd),
        stream: (options) =>
          acpClient.stream({
            cwd: options.cwd,
            sessionId: Option.map(options.sessionId, (id) => id as SessionId),
            prompt: options.prompt,
            mcpEnv: options.mcpEnv,
          }),
      });
    }),
  ).pipe(Layer.provide(AcpClient.layer));

  static layerCodex = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCodex));
  static layerClaude = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerClaude));
  static layerCopilot = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCopilot));
  static layerGemini = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerGemini));
  static layerCursor = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCursor));

  static layerFor = (backend: AgentBackend): Layer.Layer<Agent, AgentLayerError> => {
    const layers: Record<AgentBackend, Layer.Layer<Agent, AgentLayerError>> = {
      claude: Agent.layerClaude,
      codex: Agent.layerCodex,
      copilot: Agent.layerCopilot,
      gemini: Agent.layerGemini,
      cursor: Agent.layerCursor,
    };
    return layers[backend];
  };

  static layerTest = (fixturePath: string) =>
    Layer.effect(
      Agent,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const decode = Schema.decodeSync(AcpSessionUpdate);

        return Agent.of({
          stream: () =>
            fs.stream(fixturePath).pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.map((line) => decode(JSON.parse(line))),
              Stream.orDie,
            ),
          createSession: () => Effect.die("createSession not supported for test layer"),
        });
      }),
    ).pipe(Layer.provide(NodeServices.layer));
}
