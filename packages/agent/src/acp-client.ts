import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import {
  Cause,
  Effect,
  FiberMap,
  Layer,
  Option,
  Queue,
  References,
  Schema,
  ServiceMap,
  Stream,
} from "effect";
import { AcpSessionUpdate } from "@browser-tester/shared/models";
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
        return AcpAdapter.of({
          bin: process.execPath,
          args: [binPath],
          env: {},
        });
      },
      catch: () =>
        new AcpAdapterNotFoundError({
          packageName: "@zed-industries/codex-acp",
        }),
    }),
  );

  static layerClaude = Layer.effect(AcpAdapter)(
    Effect.try({
      try: () => {
        const require = createRequire(
          typeof __filename !== "undefined" ? __filename : import.meta.url,
        );
        const binPath = require.resolve("@zed-industries/claude-agent-acp/dist/index.js");
        return AcpAdapter.of({
          bin: process.execPath,
          args: [binPath],
          env: {},
        });
      },
      catch: () =>
        new AcpAdapterNotFoundError({
          packageName: "@zed-industries/claude-agent-acp",
        }),
    }),
  );
}

export class AcpClient extends ServiceMap.Service<AcpClient>()("@browser-tester/AcpClient", {
  make: Effect.gen(function* () {
    const x = yield* References.CurrentLogLevel;
    console.log("CURRENT LOGL EVEL", x);
    const adapter = yield* AcpAdapter;
    yield* Effect.annotateLogsScoped({ adapter: adapter.args[0] });
    yield* Effect.logInfo(`Initializing AcpClient`);
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    /** @note(rasmus): FiberMap that runs strems */
    const streamFiberMap = yield* FiberMap.make<SessionId>();

    const writableQueue = yield* Queue.unbounded<Uint8Array>();
    const sessionUpdatesMap = new Map<SessionId, Queue.Queue<AcpSessionUpdate, Cause.Done>>();

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
          return console.warn(`updates queue not found for session ${sessionId}`);
        const decoded = Schema.decodeUnknownSync(AcpSessionUpdate)(update);
        Queue.offerUnsafe(updatesQueue, decoded);
      },
    };

    const childProcess = yield* ChildProcess.make(adapter.bin, adapter.args, {
      env: adapter.env,
    }).pipe(spawner.spawn);
    yield* Effect.annotateLogsScoped({ pid: childProcess.pid });
    yield* Effect.logDebug("ACP adapter subprocess spawned");
    /** @note(rasmus): we run all the writable queue entries into the process stdin */
    yield* Stream.fromQueue(writableQueue).pipe(Stream.run(childProcess.stdin), Effect.forkScoped);

    const readable = Stream.toReadableStream(childProcess.stdout);
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => void Queue.offerUnsafe(writableQueue, chunk),
    });
    const ndJsonStream = acp.ndJsonStream(writable, readable);

    const connection = new acp.ClientSideConnection((_agent) => client, ndJsonStream);

    const browserMcpBinPath = fileURLToPath(import.meta.resolve("@browser-tester/browser/cli"));

    const MCP_SERVERS: acp.McpServer[] = [
      {
        command: process.execPath,
        args: [browserMcpBinPath],
        env: [],
        name: "browser",
      },
    ];

    const initResponse = yield* Effect.tryPromise({
      try: () =>
        connection.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
        }),
      catch: (cause) => new AcpConnectionInitError({ cause }),
    });
    yield* Effect.logInfo("ACP connection initialized", {
      capabilities: initResponse.agentCapabilities,
      mcpServers: MCP_SERVERS.map((server) => server.name),
    });

    const createSession = Effect.fn("AcpClient.createSession")(function* (cwd: string) {
      yield* Effect.annotateCurrentSpan({ cwd });
      return yield* Effect.tryPromise({
        try: () => connection.newSession({ cwd, mcpServers: MCP_SERVERS }),
        catch: (cause) => new AcpSessionCreateError({ cause }),
      }).pipe(
        Effect.map(({ sessionId }) => SessionId.makeUnsafe(sessionId)),
        Effect.tap((sessionId) =>
          Effect.gen(function* () {
            const updatesQueue = yield* Queue.unbounded<AcpSessionUpdate, Cause.Done>();
            sessionUpdatesMap.set(sessionId, updatesQueue);
            yield* Effect.logInfo("ACP session created", { sessionId });
          }),
        ),
      );
    });

    const getQueueBySessionId = Effect.fn("AcpClient.getQueueBySessionId")(function* (
      sessionId: SessionId,
    ) {
      if (!sessionUpdatesMap.has(sessionId)) {
        return yield* Effect.die(
          `Session ${sessionId} not initialized, did you forget to call createSession?`,
        );
      }
      const fresh = yield* Queue.unbounded<AcpSessionUpdate, Cause.Done>();
      sessionUpdatesMap.set(sessionId, fresh);
      return fresh;
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

      yield* Effect.logDebug("ACP stream starting", { sessionId });

      const updatesQueue = yield* getQueueBySessionId(sessionId);

      yield* Effect.tryPromise({
        try: () =>
          connection.prompt({
            sessionId,
            prompt: [{ type: "text", text: prompt }],
          }),
        catch: (cause) => new AcpStreamError({ cause }),
      }).pipe(
        Effect.tap(() => Effect.logDebug("ACP prompt completed")),
        Effect.tap(() => Queue.end(updatesQueue)),
        FiberMap.run(streamFiberMap, sessionId, { startImmediately: true }),
      );

      return Stream.fromQueue(updatesQueue);
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
