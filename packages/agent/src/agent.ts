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
import { AcpSessionUpdate, type AcpConfigOption } from "@expect/shared/models";
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

export type AgentBackend =
  | "claude"
  | "codex"
  | "copilot"
  | "gemini"
  | "cursor"
  | "opencode"
  | "droid";

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
    readonly setConfigOption: (
      sessionId: SessionId,
      configId: string,
      value: string | boolean,
    ) => Effect.Effect<unknown, AcpStreamError>;
    readonly fetchConfigOptions: (
      cwd: string,
    ) => Effect.Effect<
      readonly AcpConfigOption[],
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
            systemPrompt: options.systemPrompt,
            modelPreference: options.modelPreference,
          }),
        setConfigOption: (sessionId, configId, value) =>
          acpClient.setConfigOption(sessionId as SessionId, configId, value),
        fetchConfigOptions: (cwd) => acpClient.fetchConfigOptions(cwd),
      });
    }),
  ).pipe(Layer.provide(AcpClient.layer));

  static layerCodex = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCodex));
  static layerClaude = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerClaude));
  static layerCopilot = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCopilot));
  static layerGemini = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerGemini));
  static layerCursor = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCursor));
  static layerOpencode = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerOpencode));
  static layerDroid = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerDroid));

  static layerFor = (backend: AgentBackend): Layer.Layer<Agent, AgentLayerError> => {
    const layers: Record<AgentBackend, Layer.Layer<Agent, AgentLayerError>> = {
      claude: Agent.layerClaude,
      codex: Agent.layerCodex,
      copilot: Agent.layerCopilot,
      gemini: Agent.layerGemini,
      cursor: Agent.layerCursor,
      opencode: Agent.layerOpencode,
      droid: Agent.layerDroid,
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
          setConfigOption: () => Effect.die("setConfigOption not supported for test layer"),
          fetchConfigOptions: () => Effect.succeed([] as AcpConfigOption[]),
        });
      }),
    ).pipe(Layer.provide(NodeServices.layer));
}
