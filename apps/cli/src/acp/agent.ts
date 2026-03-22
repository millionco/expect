import { Effect, FileSystem, Layer, Schema, Stream } from "effect";
import { Agent, AgentStreamError } from "@browser-tester/shared/agent";
import { ExecutionEvent } from "@browser-tester/shared/models";
import { AcpAgentConfig, KNOWN_ACP_AGENTS } from "@browser-tester/acp";
import { NodeServices } from "@effect/platform-node";
import { ClaudeProvider } from "./providers/claude.js";
import { CodexProvider } from "./providers/codex.js";
import { AcpProvider } from "./providers/acp.js";
import { CurrentModel } from "./current-model.js";

export type AgentBackend = string | AcpAgentConfig;

export const layerClaude = Layer.effect(Agent)(
  Effect.gen(function* () {
    const provider = yield* ClaudeProvider;
    return Agent.of({
      stream: (options) =>
        provider
          .stream(options)
          .pipe(
            Stream.mapError(
              (error) => new AgentStreamError({ provider: "claude", cause: error.cause }),
            ),
          ),
    });
  }),
).pipe(Layer.provide(ClaudeProvider.layer), Layer.provide(CurrentModel.layerClaude));

export const layerCodex = Layer.effect(Agent)(
  Effect.gen(function* () {
    const provider = yield* CodexProvider;
    return Agent.of({
      stream: (options) =>
        provider
          .stream(options)
          .pipe(
            Stream.mapError(
              (error) => new AgentStreamError({ provider: "codex", cause: error.cause }),
            ),
          ),
    });
  }),
).pipe(Layer.provide(CodexProvider.layer), Layer.provide(CurrentModel.layerCodex));

export const layerAcp = (config: AcpAgentConfig) =>
  Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* AcpProvider;
      return Agent.of({
        stream: (options) =>
          provider
            .stream(options)
            .pipe(
              Stream.mapError(
                (error) =>
                  new AgentStreamError({ provider: config.displayName, cause: error.cause }),
              ),
            ),
      });
    }),
  ).pipe(Layer.provide(AcpProvider.layerFor(config)));

export const layerFor = (backend: AgentBackend) => {
  if (backend instanceof AcpAgentConfig) return layerAcp(backend);
  if (backend === "claude") return layerClaude;
  if (backend === "codex") return layerCodex;
  if (backend === "acp") {
    const defaultAgent = KNOWN_ACP_AGENTS["claude-code"];
    if (!defaultAgent) return layerClaude;
    return layerAcp(defaultAgent);
  }
  const knownAgent = KNOWN_ACP_AGENTS[backend];
  if (knownAgent) return layerAcp(knownAgent);
  return layerAcp(new AcpAgentConfig({ command: backend, args: [], displayName: backend }));
};

export const layerTest = (fixturePath: string) =>
  Layer.effect(
    Agent,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      return Agent.of({
        stream: () =>
          fileSystem.stream(fixturePath).pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.mapEffect((line) =>
              Schema.decodeEffect(Schema.fromJsonString(ExecutionEvent))(line),
            ),
            Stream.orDie,
          ),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));
