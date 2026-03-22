import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import * as acp from "@agentclientprotocol/sdk";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import { AcpSessionNotification } from "./schemas/acp-stream.js";
import { AgentStreamOptions } from "./types.js";

export class AcpError extends Schema.ErrorClass<AcpError>("AcpError")({
  _tag: Schema.tag("AcpError"),
  cause: Schema.String,
}) {
  message = `ACP error: ${this.cause}`;
}

interface AdapterCommand {
  readonly bin: string;
  readonly args: readonly string[];
  readonly env: Record<string, string>;
}

export type AcpBackend = "codex" | "claude";

const resolveAdapterCommand = (backend: AcpBackend): Effect.Effect<AdapterCommand, AcpError> =>
  Effect.gen(function* () {
    // HACK: resolve dynamically based on which adapter is installed
    const require = createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url);

    if (backend === "codex") {
      try {
        const binPath = require.resolve("@zed-industries/codex-acp/bin/codex-acp.js");
        return { bin: "node", args: [binPath], env: {} };
      } catch {
        return yield* new AcpError({
          cause: "codex-acp adapter not found. Install @zed-industries/codex-acp.",
        });
      }
    }

    try {
      const binPath = require.resolve("@zed-industries/claude-agent-acp/dist/index.js");
      return { bin: "node", args: [binPath], env: {} };
    } catch {
      return yield* new AcpError({
        cause: "claude-agent-acp adapter not found. Install @zed-industries/claude-agent-acp.",
      });
    }
  });

const resolveBrowserMcpBinPath = (): Effect.Effect<string, AcpError> =>
  Effect.try({
    try: () => fileURLToPath(import.meta.resolve("@browser-tester/browser/cli")),
    catch: () => new AcpError({ cause: "Browser MCP binary not found" }),
  });

interface AcpSessionDone {
  readonly _tag: "done";
  readonly sessionId: string;
}

const runAcpSession = (
  adapterCommand: AdapterCommand,
  browserMcpBinPath: string,
  options: AgentStreamOptions,
): AsyncIterable<unknown | AcpSessionDone> => {
  const buffer: unknown[] = [];
  let waiting: ((result: IteratorResult<unknown>) => void) | undefined;
  let done = false;

  const push = (item: unknown) => {
    if (waiting) {
      const resolve = waiting;
      waiting = undefined;
      resolve({ value: item, done: false });
    } else {
      buffer.push(item);
    }
  };

  const finish = () => {
    done = true;
    if (waiting) {
      const resolve = waiting;
      waiting = undefined;
      resolve({ value: undefined, done: true });
    }
  };

  const child = spawn(adapterCommand.bin, [...adapterCommand.args], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ...adapterCommand.env },
  });

  const ndJsonStream = acp.ndJsonStream(
    Writable.toWeb(child.stdin!),
    Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
  );

  const client: acp.Client = {
    sessionUpdate: (params) => {
      push(params);
      return Promise.resolve();
    },
    requestPermission: (params) =>
      Promise.resolve({
        outcome: {
          outcome: "selected" as const,
          optionId:
            params.options.find(
              (option) => option.kind === "allow_always" || option.kind === "allow_once",
            )?.optionId ?? params.options[0].optionId,
        },
      }),
    readTextFile: () => Promise.resolve({ content: "" }),
    writeTextFile: () => Promise.resolve({}),
  };

  const connection = new acp.ClientSideConnection((_agent) => client, ndJsonStream);

  const mcpServers = [
    {
      command: "node",
      args: [browserMcpBinPath],
      env: [] as { name: string; value: string }[],
      name: "browser",
    },
  ];

  const lifecycle = async () => {
    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    let sessionId: string;
    if (Option.isSome(options.sessionId)) {
      await connection.loadSession({
        sessionId: options.sessionId.value,
        cwd: options.cwd,
        mcpServers,
      });
      sessionId = options.sessionId.value;
    } else {
      const result = await connection.newSession({
        cwd: options.cwd,
        mcpServers,
      });
      sessionId = result.sessionId;
    }

    await connection.prompt({
      sessionId,
      prompt: [{ type: "text", text: options.prompt }],
    });

    push({ _tag: "done", sessionId } satisfies AcpSessionDone);
    finish();
  };

  lifecycle().catch(() => finish());

  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<unknown>> {
          if (buffer.length > 0) {
            return Promise.resolve({ value: buffer.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => {
            waiting = resolve;
          });
        },
        return(): Promise<IteratorResult<unknown>> {
          child.kill();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
};

const isSessionDone = (event: unknown): event is AcpSessionDone =>
  typeof event === "object" &&
  event !== null &&
  "_tag" in event &&
  (event as AcpSessionDone)._tag === "done";

const makeAcpProvider = (backend: AcpBackend) =>
  Effect.gen(function* () {
    const adapterCommand = yield* resolveAdapterCommand(backend);
    const browserMcpBinPath = yield* resolveBrowserMcpBinPath();

    const stream = (options: AgentStreamOptions) => {
      const session = runAcpSession(adapterCommand, browserMcpBinPath, options);

      return Stream.fromAsyncIterable(
        session,
        (cause) => new AcpError({ cause: String(cause) }),
      ).pipe(
        Stream.mapEffect((rawEvent) => {
          if (isSessionDone(rawEvent)) {
            const metadata: LanguageModelV3StreamPart = {
              type: "response-metadata",
              id: rawEvent.sessionId,
              timestamp: new Date(),
              modelId: undefined,
            };
            return Effect.succeed(Option.some<LanguageModelV3StreamPart[]>([metadata]));
          }
          return Schema.decodeUnknownEffect(AcpSessionNotification)(rawEvent).pipe(
            Effect.map((notification) => notification.update.streamParts),
            Effect.tapErrorTag("SchemaError", (error) =>
              Effect.logWarning("SchemaError decoding ACP session update", {
                error: error.message,
                rawEvent: JSON.stringify(rawEvent),
              }),
            ),
            Effect.catchTag("SchemaError", Effect.die),
          );
        }),
        Stream.filter(Option.isSome),
        Stream.flatMap((option) => Stream.fromIterable(option.value)),
      );
    };

    return { stream } as const;
  });

export class AcpProvider extends ServiceMap.Service<AcpProvider>()("@browser-tester/AcpProvider", {
  make: makeAcpProvider("codex"),
}) {
  static layer = Layer.effect(this)(this.make);
  static layerCodex = Layer.effect(this)(makeAcpProvider("codex"));
  static layerClaude = Layer.effect(this)(makeAcpProvider("claude"));
}
