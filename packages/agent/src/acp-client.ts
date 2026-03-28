import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import {
  Cause,
  Config,
  Duration,
  Effect,
  FiberMap,
  FileSystem,
  Layer,
  Match,
  Option,
  Queue,
  Ref,
  Schema,
  ServiceMap,
  Stream,
  String as Str,
} from "effect";
import { AcpSessionUpdate, AgentProvider } from "@expect/shared/models";
import { hasStringMessage } from "@expect/shared/utils";

import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as NodeServices from "@effect/platform-node/NodeServices";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

const ACP_STREAM_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;

export class AcpStreamError extends Schema.ErrorClass<AcpStreamError>("AcpStreamError")({
  _tag: Schema.tag("AcpStreamError"),
  cause: Schema.Unknown,
}) {
  displayName = `An unexpected error occurred while streaming`;
  message = `Streaming failed: ${this.cause}`;
}

export class AcpProviderNotInstalledError extends Schema.ErrorClass<AcpProviderNotInstalledError>(
  "AcpProviderNotInstalledError",
)({
  _tag: Schema.tag("AcpProviderNotInstalledError"),
  provider: AgentProvider,
}) {
  displayName = `${Str.capitalize(this.provider)} is not installed`;
  message = Match.value(this.provider).pipe(
    Match.when(
      "claude",
      () =>
        "Claude Code is not installed. Install it from https://code.claude.com/docs/en/overview#native-install-recommended, or use codex agent with `expect -a codex`.",
    ),
    Match.when(
      "codex",
      () =>
        "Codex CLI is not installed. Install it with `npm install -g @openai/codex`, or use Claude Code by removing the `--agent codex` option.",
    ),
    Match.when(
      "copilot",
      () =>
        "GitHub Copilot CLI is not installed. Install it with `npm install -g @github/copilot`, or use Claude Code with `expect -a claude`.",
    ),
    Match.when(
      "gemini",
      () =>
        "Gemini CLI is not installed. Install it with `npm install -g @google/gemini-cli`, or use Claude Code with `expect -a claude`.",
    ),
    Match.when(
      "cursor",
      () =>
        "Cursor agent CLI is not installed. Install it from https://cursor.com/docs/cli/acp, or use Claude Code with `expect -a claude`.",
    ),
    Match.orElse(
      () => "Your coding agent CLI is not installed. Please install it and then re-run expect.",
    ),
  );
}

export class AcpProviderUnauthenticatedError extends Schema.ErrorClass<AcpProviderUnauthenticatedError>(
  "AcpProviderUnauthenticatedError",
)({
  _tag: Schema.tag("AcpProviderUnauthenticatedError"),
  provider: AgentProvider,
}) {
  displayName = `Your ${this.provider} agent is not authenticated`;
  message = Match.value(this.provider).pipe(
    Match.when("claude", () => "Please log in using `claude login`, and then re-run expect."),
    Match.when("codex", () => "Please log in using `codex login`, and then re-run expect."),
    Match.when("copilot", () => "Please log in using `gh auth login`, and then re-run expect."),
    Match.when("gemini", () => "Please log in using `gemini auth login`, and then re-run expect."),
    Match.when("cursor", () => "Please log in using `agent login`, and then re-run expect."),
    Match.orElse(() => "Please sign in to your coding agent, and then re-run expect."),
  );
}

export class AcpProviderUsageLimitError extends Schema.ErrorClass<AcpProviderUsageLimitError>(
  "AcpProviderUsageLimitError",
)({
  _tag: Schema.tag("AcpProviderUsageLimitError"),
  provider: AgentProvider,
}) {
  displayName = `Your ${this.provider} agent has exceeded its usage limits`;
  message = `Usage limits exceeded for ${this.provider}. Please check your plan and billing.`;
}

export class AcpSessionCreateError extends Schema.ErrorClass<AcpSessionCreateError>(
  "AcpSessionCreateError",
)({
  _tag: Schema.tag("AcpSessionCreateError"),
  cause: Schema.Unknown,
}) {
  displayName = `Creating a chat session failed`;
  message = `Creating session failed: ${Cause.pretty(Cause.fail(this.cause))}`;
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
  cause: Schema.Unknown,
}) {
  message = `ACP adapter not found: ${this.packageName}. Error: ${Cause.pretty(
    Cause.fail(this.cause),
  )}`;
}

type SessionQueueError = Cause.Done | AcpStreamError;

const makeRequire = () =>
  createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url);

const resolvePackageDir = (require: NodeRequire, packageName: string): string => {
  try {
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    const paths = require.resolve.paths(packageName) ?? [];
    for (const searchPath of paths) {
      const candidate = join(searchPath, packageName);
      try {
        const content = JSON.parse(readFileSync(join(candidate, "package.json"), "utf-8"));
        if (content.name === packageName) return candidate;
      } catch {}
    }
    throw new Error(`Cannot find package root for ${packageName}`);
  }
};

const resolvePackageBin = (packageName: string): string => {
  const require = makeRequire();
  const packageDir = resolvePackageDir(require, packageName);
  const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));

  if (typeof packageJson.bin === "string") {
    return join(packageDir, packageJson.bin);
  }
  if (typeof packageJson.bin === "object" && packageJson.bin !== null) {
    const firstBinPath = String(Object.values(packageJson.bin)[0]);
    return join(packageDir, firstBinPath);
  }
  if (packageJson.main) {
    return join(packageDir, packageJson.main);
  }
  throw new Error(`Cannot resolve bin entry for ${packageName}`);
};

export class AcpAdapter extends ServiceMap.Service<
  AcpAdapter,
  {
    readonly provider: AgentProvider;
    readonly bin: string;
    readonly args: readonly string[];
    readonly env: Record<string, string>;
  }
>()("@expect/AcpAdapter") {
  static layerCodex = Layer.effect(AcpAdapter)(
    Effect.try({
      try: () => {
        const require = makeRequire();
        const binPath = require.resolve("@zed-industries/codex-acp/bin/codex-acp.js");
        return AcpAdapter.of({
          provider: "codex",
          bin: process.execPath,
          args: [binPath],
          env: {},
        });
      },
      catch: (cause) =>
        new AcpAdapterNotFoundError({
          packageName: "@zed-industries/codex-acp",
          cause,
        }),
    }),
  );

  static layerClaude = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const AuthSchema = Schema.Struct({ loggedIn: Schema.Boolean });

      /** @note(rasmus): assert authenticated */
      yield* ChildProcess.make(`claude`, ["auth", "status"]).pipe(
        spawner.string,
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(AuthSchema))),
        Effect.flatMap(({ loggedIn }) =>
          loggedIn
            ? Effect.void
            : new AcpProviderUnauthenticatedError({
                provider: "claude",
              }).asEffect(),
        ),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderNotInstalledError({ provider: "claude" }).asEffect(),
        ),
      );

      return yield* Effect.try({
        try: () => {
          const require = makeRequire();
          const binPath = require.resolve("@zed-industries/claude-agent-acp/dist/index.js");
          return AcpAdapter.of({
            provider: "claude",
            bin: process.execPath,
            args: [binPath],
            env: {},
          });
        },
        catch: (cause) =>
          new AcpAdapterNotFoundError({
            packageName: "@zed-industries/claude-agent-acp",
            cause,
          }),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerCopilot = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      // HACK: only checks gh CLI auth, not env var (COPILOT_GITHUB_TOKEN/GH_TOKEN) or keyring auth
      // gh CLI missing means we can't verify auth — treat as unauthenticated, not uninstalled
      yield* ChildProcess.make("gh", ["auth", "token"]).pipe(
        spawner.string,
        Effect.flatMap((token) =>
          token.trim().length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "copilot" }).asEffect(),
        ),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderUnauthenticatedError({ provider: "copilot" }).asEffect(),
        ),
      );

      return yield* Effect.try({
        try: () => {
          const binPath = resolvePackageBin("@github/copilot");
          return AcpAdapter.of({
            provider: "copilot",
            bin: process.execPath,
            args: [binPath, "--acp"],
            env: {},
          });
        },
        catch: (cause) =>
          new AcpAdapterNotFoundError({
            packageName: "@github/copilot",
            cause,
          }),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerGemini = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const homeOption = yield* Config.option(
        Config.string("HOME").pipe(Config.orElse(() => Config.string("USERPROFILE"))),
      );
      const homedir = Option.isSome(homeOption)
        ? homeOption.value
        : yield* new AcpProviderUnauthenticatedError({ provider: "gemini" });
      const accountsPath = `${homedir}/.gemini/google_accounts.json`;
      const AccountsSchema = Schema.Struct({ active: Schema.String });

      yield* fileSystem.readFileString(accountsPath).pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(AccountsSchema))),
        Effect.flatMap(({ active }) =>
          active.length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
        Effect.catchTag("SchemaError", () =>
          new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
      );

      return yield* Effect.try({
        try: () => {
          const binPath = resolvePackageBin("@google/gemini-cli");
          return AcpAdapter.of({
            provider: "gemini",
            bin: process.execPath,
            args: [binPath, "--acp"],
            env: {},
          });
        },
        catch: (cause) =>
          new AcpAdapterNotFoundError({
            packageName: "@google/gemini-cli",
            cause,
          }),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerCursor = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      yield* ChildProcess.make("agent", ["--version"]).pipe(
        spawner.string,
        Effect.timeoutOrElse({
          duration: "3 seconds",
          onTimeout: () => new AcpProviderNotInstalledError({ provider: "cursor" }).asEffect(),
        }),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderNotInstalledError({ provider: "cursor" }).asEffect(),
        ),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderNotInstalledError({ provider: "cursor" }).asEffect(),
        ),
      );

      yield* ChildProcess.make("agent", ["auth", "whoami"]).pipe(
        spawner.string,
        Effect.flatMap((output) =>
          output.trim().length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "cursor" }).asEffect(),
        ),
        Effect.timeoutOrElse({
          duration: "3 seconds",
          onTimeout: () => new AcpProviderUnauthenticatedError({ provider: "cursor" }).asEffect(),
        }),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderUnauthenticatedError({ provider: "cursor" }).asEffect(),
        ),
      );

      return AcpAdapter.of({
        provider: "cursor",
        bin: "agent",
        args: ["acp"],
        env: {},
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));
}

export class AcpClient extends ServiceMap.Service<AcpClient>()("@expect/AcpClient", {
  make: Effect.gen(function* () {
    const adapter = yield* AcpAdapter;
    yield* Effect.annotateLogsScoped({ adapter: adapter.args[0] });
    yield* Effect.logInfo(`Initializing AcpClient`);
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    /** @note(rasmus): FiberMap that runs strems */
    const streamFiberMap = yield* FiberMap.make<SessionId>();

    const writableQueue = yield* Queue.unbounded<Uint8Array>();
    const sessionUpdatesMap = new Map<
      SessionId,
      Queue.Queue<AcpSessionUpdate, SessionQueueError>
    >();

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
      extendEnv: true,
    }).pipe(spawner.spawn);
    yield* Effect.annotateLogsScoped({ pid: childProcess.pid });
    yield* Effect.logDebug("ACP adapter subprocess spawned");
    /** @note(rasmus): we run all the writable queue entries into the process stdin */
    yield* Stream.fromQueue(writableQueue).pipe(Stream.run(childProcess.stdin), Effect.forkScoped);
    yield* childProcess.stderr.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.tap((line) => Effect.logDebug("ACP adapter stderr", { line })),
      Stream.runDrain,
      Effect.forkScoped,
    );

    const readable = Stream.toReadableStream(childProcess.stdout);
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => void Queue.offerUnsafe(writableQueue, chunk),
    });
    const ndJsonStream = acp.ndJsonStream(writable, readable);

    const connection = new acp.ClientSideConnection((_agent) => client, ndJsonStream);

    const browserMcpBinPath = fileURLToPath(new URL("./browser-mcp.js", import.meta.url));

    const buildMcpServers = (
      env: ReadonlyArray<{ name: string; value: string }>,
    ): acp.McpServer[] => [
      {
        command: process.execPath,
        args: [browserMcpBinPath],
        env: [...env],
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
    });

    const createSession = Effect.fn("AcpClient.createSession")(function* (
      cwd: string,
      mcpEnv: ReadonlyArray<{ name: string; value: string }> = [],
    ) {
      yield* Effect.annotateCurrentSpan({ cwd });
      const mcpServers = buildMcpServers(mcpEnv);
      return yield* Effect.tryPromise({
        try: () => connection.newSession({ cwd, mcpServers }),
        catch: (cause) => {
          const message = hasStringMessage(cause) ? cause.message : String(cause);

          /**
           * @note(rasmus): these are best guesses at the type of errors we might hit
           * if we're reaching usage limits because couldn't simulate this myself manually
           */
          const USAGE_LIMIT_ERRORS = ["out of usage", "limits exceeded", "usage exceeded"];
          const AUTH_ERRORS = ["authentication"];

          if (AUTH_ERRORS.some((error) => message.toLowerCase().includes(error))) {
            return new AcpProviderUnauthenticatedError({
              provider: adapter.provider,
            });
          }
          if (USAGE_LIMIT_ERRORS.some((error) => message.toLowerCase().includes(error))) {
            return new AcpProviderUsageLimitError({
              provider: adapter.provider,
            });
          }
          return new AcpSessionCreateError({ cause });
        },
      }).pipe(
        Effect.map(({ sessionId }) => SessionId.makeUnsafe(sessionId)),
        Effect.tap((sessionId) =>
          Effect.gen(function* () {
            const updatesQueue = yield* Queue.unbounded<AcpSessionUpdate, SessionQueueError>();
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
      const fresh = yield* Queue.unbounded<AcpSessionUpdate, SessionQueueError>();
      sessionUpdatesMap.set(sessionId, fresh);
      return fresh;
    });

    const stream = Effect.fn("AcpClient.stream")(function* ({
      prompt,
      sessionId: sessionIdOption,
      cwd,
      mcpEnv = [],
    }: {
      sessionId: Option.Option<SessionId>;
      prompt: string;
      cwd: string;
      mcpEnv?: ReadonlyArray<{ name: string; value: string }>;
    }) {
      const sessionId = Option.isSome(sessionIdOption)
        ? sessionIdOption.value
        : yield* createSession(cwd, mcpEnv);

      yield* Effect.logDebug("ACP stream starting", { sessionId });

      const updatesQueue = yield* getQueueBySessionId(sessionId);
      const lastActivityAt = yield* Ref.make(Date.now());

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

      const checkInactivity = Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(ACP_STREAM_INACTIVITY_TIMEOUT_MS));
        const lastActivity = yield* Ref.get(lastActivityAt);
        const elapsed = Date.now() - lastActivity;
        return elapsed >= ACP_STREAM_INACTIVITY_TIMEOUT_MS;
      });
      const inactivityWatchdog = Effect.gen(function* () {
        const isStalled = yield* Effect.repeat(checkInactivity, {
          while: (stalled) => !stalled,
        });
        if (isStalled) {
          yield* Effect.logWarning("ACP stream inactivity timeout", { sessionId });
          yield* Queue.fail(
            updatesQueue,
            new AcpStreamError({
              cause: `Agent produced no output for ${ACP_STREAM_INACTIVITY_TIMEOUT_MS / 1000}s — the agent may be stalled`,
            }),
          );
        }
      });
      yield* inactivityWatchdog.pipe(Effect.forkScoped);

      const isMeaningfulActivity = (update: AcpSessionUpdate): boolean =>
        update.sessionUpdate === "agent_message_chunk" ||
        update.sessionUpdate === "agent_thought_chunk" ||
        update.sessionUpdate === "tool_call" ||
        update.sessionUpdate === "tool_call_update";

      return Stream.fromQueue(updatesQueue).pipe(
        Stream.tap((update) =>
          isMeaningfulActivity(update) ? Ref.set(lastActivityAt, Date.now()) : Effect.void,
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
  static layerCopilot = this.layer.pipe(Layer.provide(AcpAdapter.layerCopilot));
  static layerGemini = this.layer.pipe(Layer.provide(AcpAdapter.layerGemini));
  static layerCursor = this.layer.pipe(Layer.provide(AcpAdapter.layerCursor));
}
