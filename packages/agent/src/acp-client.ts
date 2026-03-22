import { createRequire } from "node:module";
import * as acp from "@agentclientprotocol/sdk";
import { Effect, FiberMap, Layer, Option, Queue, Schema, ServiceMap, Stream } from "effect";
import { AcpSessionUpdate } from "./schemas/acp-stream.js";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { NodeServices } from "@effect/platform-node";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export class AcpStreamError extends Schema.ErrorClass<AcpStreamError>("AcpStreamError")({
  _tag: Schema.tag("AcpStreamError"),
  cause: Schema.Unknown,
}) {
  message = `Streaming failed: ${this.cause}`;
}

export class AcpSessionCreateError extends Schema.ErrorClass<AcpSessionCreateError>(
  "AcpSessionCreateError",
)({
  _tag: Schema.tag("AcpSessionCreateError"),
  cause: Schema.Unknown,
}) {
  message = `Creating session failed: ${this.cause}`;
}

export class AcpConnectionInitError extends Schema.ErrorClass<AcpConnectionInitError>(
  "AcpConnectionInitError",
)({
  _tag: Schema.tag("AcpConnectionInitError"),
  cause: Schema.Unknown,
}) {
  message = `Init connection failed: ${this.cause}`;
}

export class AcpAdapterNotFoundError extends Schema.ErrorClass<AcpAdapterNotFoundError>(
  "AcpAdapterNotFoundError",
)({
  _tag: Schema.tag("AcpAdapterNotFoundError"),
  packageName: Schema.String,
}) {
  message = `ACP adapter not found: ${this.packageName}`;
}

export class AcpAdapter extends ServiceMap.Service<
  AcpAdapter,
  {
    readonly bin: string;
    readonly args: readonly string[];
    readonly env: Record<string, string>;
  }
>()("@browser-tester/AcpAdapter") {
  static layerCodex = Layer.effect(AcpAdapter)(
    Effect.try({
      try: () => {
        const require = createRequire(
          typeof __filename !== "undefined" ? __filename : import.meta.url,
        );
        const binPath = require.resolve("@zed-industries/codex-acp/bin/codex-acp.js");
        return AcpAdapter.of({ bin: "node", args: [binPath], env: {} });
      },
      catch: () => new AcpAdapterNotFoundError({ packageName: "@zed-industries/codex-acp" }),
    }),
  );

  static layerClaude = Layer.effect(AcpAdapter)(
    Effect.try({
      try: () => {
        const require = createRequire(
          typeof __filename !== "undefined" ? __filename : import.meta.url,
        );
        const binPath = require.resolve("@zed-industries/claude-agent-acp/dist/index.js");
        return AcpAdapter.of({ bin: "node", args: [binPath], env: {} });
      },
      catch: () => new AcpAdapterNotFoundError({ packageName: "@zed-industries/claude-agent-acp" }),
    }),
  );
}

export class AcpClient extends ServiceMap.Service<AcpClient>()("@browser-tester/AcpClient", {
  make: Effect.gen(function* () {
    const adapter = yield* AcpAdapter;
    yield* Effect.annotateLogsScoped({ adapter: adapter.bin });
    yield* Effect.logInfo(`Initializing AcpClient`);
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    /** @note(rasmus): FiberMap that runs strems */
    const streamFiberMap = yield* FiberMap.make<SessionId>();

    const sessionUpdatesMap = new Map<SessionId, Queue.Queue<unknown>>();

    const client: acp.Client = {
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
      sessionUpdate: async ({ sessionId, update }) => {
        const updatesQueue = sessionUpdatesMap.get(SessionId.makeUnsafe(sessionId));
        if (updatesQueue === undefined)
          throw new Error(`Oops, session not initialized, did you forget to call createSession?`);
        Queue.offerUnsafe(updatesQueue, update);
      },
    };

    const process = yield* ChildProcess.make(adapter.bin, adapter.args, {
      env: adapter.env,
    }).pipe(spawner.spawn);

    const readable = Stream.toReadableStream(process.stdout);
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => Effect.runPromise(Stream.make(chunk).pipe(Stream.run(process.stdin))),
    });
    const ndJsonStream = acp.ndJsonStream(writable, readable);

    const connection = new acp.ClientSideConnection((_agent) => client, ndJsonStream);

    /* const browserMcpBinPath = `todo`;

      const MCP_SERVERS: acp.McpServer[] = [
        {
          command: "node",
          args: [browserMcpBinPath],
          env: [] as { name: string; value: string }[],
          name: "browser",
        },
      ]; */
    const MCP_SERVERS: acp.McpServer[] = [];

    yield* Effect.tryPromise({
      try: () =>
        connection.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
        }),
      catch: (cause) => new AcpConnectionInitError({ cause }),
    });

    const createSession = Effect.fn("AcpClient.createSession")(function* (cwd: string) {
      return yield* Effect.tryPromise({
        try: () => connection.newSession({ cwd, mcpServers: MCP_SERVERS }),
        catch: (cause) => new AcpSessionCreateError({ cause }),
      }).pipe(
        Effect.map(({ sessionId }) => SessionId.makeUnsafe(sessionId)),
        Effect.tap((sessionId) =>
          Effect.gen(function* () {
            const updatesQueue = yield* Queue.unbounded<unknown>();
            sessionUpdatesMap.set(sessionId, updatesQueue);
          }),
        ),
      );
    });

    const getQueueBySessionId = Effect.fn("AcpClient.getQueueBySessionId")(function* (
      sessionId: SessionId,
    ) {
      const queue = sessionUpdatesMap.get(sessionId);
      if (queue === undefined) {
        return yield* Effect.die(`Updates queue not found for session ${sessionId}`);
      }
      return queue;
    });

    const stream = Effect.fn("AcpClient.stream")(function* ({
      prompt,
      sessionId: sessionIdOption,
      cwd,
    }: {
      sessionId: Option.Option<SessionId>;
      prompt: string;
      cwd: string;
    }) {
      const sessionId = Option.isSome(sessionIdOption)
        ? sessionIdOption.value
        : yield* createSession(cwd);

      const updatesQueue = yield* getQueueBySessionId(sessionId);

      yield* Effect.tryPromise({
        try: () =>
          connection.prompt({
            sessionId,
            prompt: [{ type: "text", text: prompt }],
          }),
        catch: (cause) => new AcpStreamError({ cause }),
      }).pipe(
        Effect.tap(() => Queue.shutdown(updatesQueue)),
        FiberMap.run(streamFiberMap, sessionId, { startImmediately: true }),
      );

      return Stream.fromQueue(updatesQueue).pipe(
        Stream.mapEffect((raw) =>
          Schema.decodeUnknownEffect(AcpSessionUpdate)(raw).pipe(
            Effect.tapErrorTag("SchemaError", (error) =>
              Effect.logWarning("SchemaError decoding ACP session update", {
                error: error.message,
                rawEvent: JSON.stringify(raw),
              }),
            ),
            Effect.catchTag("SchemaError", Effect.die),
          ),
        ),
      );
    }, Stream.unwrap);

    return {
      createSession,
      stream,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));

  static layerCodex = this.layer.pipe(Layer.provide(AcpAdapter.layerCodex));

  static layerClaude = this.layer.pipe(Layer.provide(AcpAdapter.layerClaude));
}
