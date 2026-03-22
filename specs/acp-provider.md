# ACP Provider Spec

Replace vendor-specific agent providers (`ClaudeProvider`, `CodexProvider`) with a single `AcpProvider` service that speaks the Agent Client Protocol over stdio.

## Background

Today we have two provider implementations that each:
1. Import a vendor SDK (`@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`)
2. Call vendor-specific APIs (`query()`, `thread.runStreamed()`)
3. Decode vendor-specific event schemas (`ClaudeStreamEvent`, `CodexThreadEvent`)
4. Normalize events into `LanguageModelV3StreamPart`

ACP standardizes steps 1-3 into a single protocol. We still do step 4 (map ACP `session/update` notifications to `LanguageModelV3StreamPart`).

## Protocol Summary

ACP uses JSON-RPC 2.0 over newline-delimited JSON on stdio. The lifecycle is:

```
Client                              Agent (subprocess)
  |-- initialize ------------------>|
  |<------------- InitializeResponse|
  |-- session/new ----------------->|
  |<------------- NewSessionResponse|
  |-- session/prompt -------------->|
  |<--- session/update (chunk) -----|  (notification, no id)
  |<--- session/update (tool_call) -|
  |<--- session/update (chunk) -----|
  |<-------------- PromptResponse   |  (stopReason: "end_turn")
  |-- session/prompt -------------->|  (resume same session)
  ...
```

Key types from `@agentclientprotocol/sdk`:
- `ClientSideConnection` — manages the JSON-RPC connection
- `Client` interface — callbacks: `sessionUpdate()`, `requestPermission()`, `readTextFile()`, `writeTextFile()`
- `ndJsonStream(writable, readable)` — creates the stdio transport
- `PROTOCOL_VERSION` — current protocol version integer

## ACP Adapters

Both adapters are npm packages that ship platform-specific native binaries via optional deps:

| Agent | Package | Binary |
|-------|---------|--------|
| Codex | `@zed-industries/codex-acp@^0.10.0` | Rust binary, zero JS deps |
| Claude | `@zed-industries/claude-agent-acp@^0.22.2` | TypeScript, depends on `@anthropic-ai/claude-agent-sdk` |

Both follow the same pattern: a `bin/` shim dispatches to the platform binary. Resolve via `require.resolve("@zed-industries/codex-acp/bin/codex-acp.js")`.

## Architecture

### New Files

```
packages/agent/src/
  acp-provider.ts          # AcpProvider service (all logic lives here)
  schemas/acp-stream.ts    # Schema.Class types for ACP session/update events
```

### ACP Event Schemas (`schemas/acp-stream.ts`)

Follows the same pattern as `ClaudeStreamEvent` and `CodexThreadEvent`: Schema.Class types with `streamParts` getters that produce `LanguageModelV3StreamPart[]`.

```ts
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Option, Schema } from "effect";

const AcpToolCallStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const);

const AcpToolKind = Schema.Literals([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
] as const);

const AcpStopReason = Schema.Literals([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
] as const);

const AcpContentBlock = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("image"), data: Schema.String, mimeType: Schema.String }),
  Schema.Struct({ type: Schema.Literal("resource_link"), uri: Schema.String }),
  Schema.Struct({ type: Schema.Literal("resource"), uri: Schema.String }),
]);

const AcpToolCallContent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("content"),
    content: AcpContentBlock,
  }),
  Schema.Struct({
    type: Schema.Literal("diff"),
    path: Schema.String,
    oldText: Schema.optional(Schema.String),
    newText: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("terminal"),
    terminalId: Schema.String,
  }),
]);

const AcpToolCallLocation = Schema.Struct({
  path: Schema.String,
  lineNumber: Schema.optional(Schema.Number),
});

// --- Session Update variants ---

let blockIdCounter = 0;

export class AcpAgentMessageChunk extends Schema.Class<AcpAgentMessageChunk>(
  "AcpAgentMessageChunk",
)({
  sessionUpdate: Schema.Literal("agent_message_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.String),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    if (this.content.type === "text") {
      const blockId = `acp-block-${blockIdCounter++}`;
      return Option.some([
        { type: "text-start", id: blockId },
        { type: "text-delta", id: blockId, delta: this.content.text },
        { type: "text-end", id: blockId },
      ]);
    }
    return Option.none();
  }
}

export class AcpAgentThoughtChunk extends Schema.Class<AcpAgentThoughtChunk>(
  "AcpAgentThoughtChunk",
)({
  sessionUpdate: Schema.Literal("agent_thought_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.String),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    if (this.content.type === "text") {
      const blockId = `acp-thought-${blockIdCounter++}`;
      return Option.some([
        { type: "reasoning-start", id: blockId },
        { type: "reasoning-delta", id: blockId, delta: this.content.text },
        { type: "reasoning-end", id: blockId },
      ]);
    }
    return Option.none();
  }
}

export class AcpUserMessageChunk extends Schema.Class<AcpUserMessageChunk>(
  "AcpUserMessageChunk",
)({
  sessionUpdate: Schema.Literal("user_message_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.String),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class AcpToolCall extends Schema.Class<AcpToolCall>("AcpToolCall")({
  sessionUpdate: Schema.Literal("tool_call"),
  toolCallId: Schema.String,
  title: Schema.String,
  kind: Schema.optional(AcpToolKind),
  status: Schema.optional(AcpToolCallStatus),
  content: Schema.optional(Schema.Array(AcpToolCallContent)),
  locations: Schema.optional(Schema.Array(AcpToolCallLocation)),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    const inputString = JSON.stringify(this.rawInput ?? {});
    return Option.some([
      {
        type: "tool-input-start" as const,
        id: this.toolCallId,
        toolName: this.title,
        providerExecuted: true,
      },
      { type: "tool-input-delta" as const, id: this.toolCallId, delta: inputString },
      { type: "tool-input-end" as const, id: this.toolCallId },
      {
        type: "tool-call" as const,
        toolCallId: this.toolCallId,
        toolName: this.title,
        input: inputString,
        providerExecuted: true,
      },
    ]);
  }
}

export class AcpToolCallUpdate extends Schema.Class<AcpToolCallUpdate>("AcpToolCallUpdate")({
  sessionUpdate: Schema.Literal("tool_call_update"),
  toolCallId: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  kind: Schema.optional(Schema.NullOr(AcpToolKind)),
  status: Schema.optional(Schema.NullOr(AcpToolCallStatus)),
  content: Schema.optional(Schema.NullOr(Schema.Array(AcpToolCallContent))),
  locations: Schema.optional(Schema.NullOr(Schema.Array(AcpToolCallLocation))),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    if (this.status === "completed" || this.status === "failed") {
      const result = JSON.stringify(this.rawOutput ?? {});
      return Option.some([
        {
          type: "tool-result" as const,
          toolCallId: this.toolCallId,
          toolName: this.title ?? "",
          result,
          isError: this.status === "failed",
        },
      ]);
    }
    return Option.none();
  }
}

const AcpPlanEntryStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
] as const);

const AcpPlanEntryPriority = Schema.Literals(["high", "medium", "low"] as const);

export class AcpPlanUpdate extends Schema.Class<AcpPlanUpdate>("AcpPlanUpdate")({
  sessionUpdate: Schema.Literal("plan"),
  entries: Schema.Array(
    Schema.Struct({
      content: Schema.String,
      priority: AcpPlanEntryPriority,
      status: AcpPlanEntryStatus,
    }),
  ),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class AcpAvailableCommandsUpdate extends Schema.Class<AcpAvailableCommandsUpdate>(
  "AcpAvailableCommandsUpdate",
)({
  sessionUpdate: Schema.Literal("available_commands_update"),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class AcpCurrentModeUpdate extends Schema.Class<AcpCurrentModeUpdate>(
  "AcpCurrentModeUpdate",
)({
  sessionUpdate: Schema.Literal("current_mode_update"),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class AcpConfigOptionUpdate extends Schema.Class<AcpConfigOptionUpdate>(
  "AcpConfigOptionUpdate",
)({
  sessionUpdate: Schema.Literal("config_option_update"),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class AcpSessionInfoUpdate extends Schema.Class<AcpSessionInfoUpdate>(
  "AcpSessionInfoUpdate",
)({
  sessionUpdate: Schema.Literal("session_info_update"),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class AcpUsageUpdate extends Schema.Class<AcpUsageUpdate>("AcpUsageUpdate")({
  sessionUpdate: Schema.Literal("usage_update"),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export const AcpSessionUpdate = Schema.Union([
  AcpAgentMessageChunk,
  AcpAgentThoughtChunk,
  AcpUserMessageChunk,
  AcpToolCall,
  AcpToolCallUpdate,
  AcpPlanUpdate,
  AcpAvailableCommandsUpdate,
  AcpCurrentModeUpdate,
  AcpConfigOptionUpdate,
  AcpSessionInfoUpdate,
  AcpUsageUpdate,
]);
export type AcpSessionUpdate = typeof AcpSessionUpdate.Type;

export class AcpSessionNotification extends Schema.Class<AcpSessionNotification>(
  "AcpSessionNotification",
)({
  sessionId: Schema.String,
  update: AcpSessionUpdate,
}) {}

export const AcpUsage = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cachedReadTokens: Schema.optional(Schema.NullOr(Schema.Number)),
  cachedWriteTokens: Schema.optional(Schema.NullOr(Schema.Number)),
  thoughtTokens: Schema.optional(Schema.NullOr(Schema.Number)),
});

export class AcpPromptResponse extends Schema.Class<AcpPromptResponse>("AcpPromptResponse")({
  stopReason: AcpStopReason,
  usage: Schema.optional(Schema.NullOr(AcpUsage)),
}) {}
```

### AcpProvider Service (`acp-provider.ts`)

All logic lives inside the service `make`. Dependencies are yielded at construction time.

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import * as acp from "@agentclientprotocol/sdk";
import { Effect, Layer, Option, Queue, Schema, ServiceMap, Stream } from "effect";
import { AcpSessionNotification, AcpSessionUpdate } from "./schemas/acp-stream.js";
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

export class AcpProvider extends ServiceMap.Service<AcpProvider>()(
  "@browser-tester/AcpProvider",
  {
    make: Effect.gen(function* () {
      const adapterCommand = yield* resolveAdapterCommand();
      const browserMcpBinPath = yield* resolveBrowserMcpBinPath();

      const spawnAgent = Effect.fn("AcpProvider.spawnAgent")(function* () {
        return yield* Effect.acquireRelease(
          Effect.sync(() =>
            spawn(adapterCommand.bin, [...adapterCommand.args], {
              stdio: ["pipe", "pipe", "inherit"],
              env: { ...process.env, ...adapterCommand.env },
            }),
          ),
          (child) =>
            Effect.sync(() => {
              child.kill();
            }),
        );
      });

      const initializeConnection = Effect.fn("AcpProvider.initializeConnection")(
        function* (child: ChildProcess) {
          const ndJsonStream = acp.ndJsonStream(
            Writable.toWeb(child.stdin!),
            Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
          );

          const updateQueue = yield* Queue.unbounded<unknown>();

          const client: acp.Client = {
            sessionUpdate: (params) => {
              void Effect.runPromise(Queue.offer(updateQueue, params));
              return Promise.resolve();
            },
            requestPermission: (params) =>
              Promise.resolve({
                outcome: {
                  outcome: "selected" as const,
                  optionId: params.options.find(
                    (option) => option.kind === "allow_always" || option.kind === "allow_once",
                  )?.optionId ?? params.options[0].optionId,
                },
              }),
            readTextFile: () => Promise.resolve({ content: "" }),
            writeTextFile: () => Promise.resolve({}),
          };

          const connection = new acp.ClientSideConnection((_agent) => client, ndJsonStream);

          yield* Effect.tryPromise({
            try: () =>
              connection.initialize({
                protocolVersion: acp.PROTOCOL_VERSION,
                clientCapabilities: {},
              }),
            catch: (cause) => new AcpError({ cause: String(cause) }),
          });

          return { connection, updateQueue } as const;
        },
      );

      const createSession = Effect.fn("AcpProvider.createSession")(
        function* (
          connection: acp.ClientSideConnection,
          options: AgentStreamOptions,
        ) {
          const result = yield* Effect.tryPromise({
            try: () =>
              connection.newSession({
                cwd: options.cwd,
                mcpServers: [
                  {
                    command: browserMcpBinPath,
                    args: [],
                    env: {},
                    name: "browser",
                  },
                ],
              }),
            catch: (cause) => new AcpError({ cause: String(cause) }),
          });
          return result.sessionId;
        },
      );

      const streamPrompt = Effect.fn("AcpProvider.streamPrompt")(
        function* (
          connection: acp.ClientSideConnection,
          updateQueue: Queue.Queue<unknown>,
          sessionId: string,
          options: AgentStreamOptions,
        ) {
          const promptEffect = Effect.tryPromise({
            try: () =>
              connection.prompt({
                sessionId,
                prompt: [{ type: "text", text: options.prompt }],
              }),
            catch: (cause) => new AcpError({ cause: String(cause) }),
          });

          const updateStream = Stream.fromQueue(updateQueue).pipe(
            Stream.mapEffect((raw) =>
              Schema.decodeUnknownEffect(AcpSessionNotification)(raw).pipe(
                Effect.tapErrorTag("SchemaError", (error) =>
                  Effect.logWarning("SchemaError decoding ACP session update", {
                    error: error.message,
                    rawEvent: JSON.stringify(raw),
                  }),
                ),
                Effect.catchTag("SchemaError", Effect.die),
              ),
            ),
            Stream.map((notification) => notification.update.streamParts),
            Stream.filter(Option.isSome),
            Stream.flatMap((option) => Stream.fromIterable(option.value)),
          );

          const promptStream = Stream.fromEffect(promptEffect).pipe(
            Stream.map(
              (response): LanguageModelV3StreamPart => ({
                type: "response-metadata",
                id: sessionId,
                timestamp: new Date(),
                modelId: undefined,
                headers: undefined,
              }),
            ),
          );

          return Stream.merge(updateStream, promptStream);
        },
        Stream.unwrap,
      );

      const stream = (options: AgentStreamOptions) =>
        Stream.unwrapScoped(
          Effect.gen(function* () {
            const child = yield* spawnAgent();
            const { connection, updateQueue } = yield* initializeConnection(child);
            const sessionId = yield* createSession(connection, options);
            return yield* streamPrompt(connection, updateQueue, sessionId, options);
          }),
        );

      return { stream } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}
```

### Adapter Resolution

The `resolveAdapterCommand` function uses `createRequire` to find the adapter binary from `node_modules`, same pattern as `resolveClaudeExecutablePath` in `claude-provider.ts`.

```ts
const resolveAdapterCommand = (): Effect.Effect<AdapterCommand, AcpError> =>
  Effect.gen(function* () {
    // HACK: resolve dynamically based on which adapter is installed
    const require = createRequire(
      typeof __filename !== "undefined" ? __filename : import.meta.url,
    );

    try {
      const binPath = require.resolve("@zed-industries/codex-acp/bin/codex-acp.js");
      return { bin: "node", args: [binPath], env: {} };
    } catch {
      // fall through
    }

    try {
      const binPath = require.resolve("@zed-industries/claude-agent-acp/bin/claude-agent-acp.js");
      return { bin: "node", args: [binPath], env: {} };
    } catch {
      // fall through
    }

    return yield* new AcpError({ cause: "No ACP adapter found. Install @zed-industries/codex-acp or @zed-industries/claude-agent-acp." });
  });
```

In practice, we provide separate layers per backend so the correct adapter is always resolved:

```ts
export class AcpProvider extends ServiceMap.Service<AcpProvider>()(...) {
  static layerCodex = this.layer.pipe(
    Layer.provide(/* AdapterCommand for codex-acp */),
  );
  static layerClaude = this.layer.pipe(
    Layer.provide(/* AdapterCommand for claude-agent-acp */),
  );
}
```

### Browser MCP Binary Resolution

The browser MCP server already has a standalone stdio entry point at `packages/browser/src/mcp/start.ts`, exported as `@browser-tester/browser/cli` (`dist/mcp/start.mjs`).

```ts
const resolveBrowserMcpBinPath = (): Effect.Effect<string, AcpError> =>
  Effect.try({
    try: () => {
      const require = createRequire(
        typeof __filename !== "undefined" ? __filename : import.meta.url,
      );
      return require.resolve("@browser-tester/browser/cli");
    },
    catch: () => new AcpError({ cause: "Browser MCP binary not found" }),
  });
```

The ACP session setup passes it as:
```ts
mcpServers: [{
  command: "node",
  args: [browserMcpBinPath],
  env: {},
  name: "browser",
}]
```

### Agent Layer Composition

```ts
export class Agent extends ServiceMap.Service<Agent, { ... }>()("@browser-tester/Agent") {
  // Existing layers kept during migration
  static layerClaude = ...;
  static layerCodex = ...;

  // New ACP layers
  static layerAcpCodex = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* AcpProvider;
      return Agent.of({ stream: (options) => provider.stream(options) });
    }),
  ).pipe(Layer.provide(AcpProvider.layerCodex));

  static layerAcpClaude = Layer.effect(Agent)(
    Effect.gen(function* () {
      const provider = yield* AcpProvider;
      return Agent.of({ stream: (options) => provider.stream(options) });
    }),
  ).pipe(Layer.provide(AcpProvider.layerClaude));
}
```

### Executor Compatibility

`ExecutionError.reason` currently is `Schema.Union([ClaudeQueryError, CodexRunError])`. Add `AcpError`:

```ts
export class ExecutionError extends Schema.ErrorClass<ExecutionError>("@supervisor/ExecutionError")({
  _tag: Schema.tag("@supervisor/ExecutionError"),
  reason: Schema.Union([ClaudeQueryError, CodexRunError, AcpError]),
}) {
  message = `Execution failed: ${this.reason.message}`;
}
```

### Permissions

All permissions are auto-approved. The `requestPermission` handler finds the first `allow_always` or `allow_once` option and selects it. If neither exists, it selects the first option.

## Dependencies

Add to `packages/agent/package.json`:
```json
{
  "@agentclientprotocol/sdk": "^0.16.1",
  "@zed-industries/codex-acp": "^0.10.0",
  "@zed-industries/claude-agent-acp": "^0.22.2"
}
```

Remove after migration:
- `@openai/codex-sdk`
- `@anthropic-ai/claude-agent-sdk`

## Migration Path

1. Add `AcpProvider` alongside existing providers. Add `Agent.layerAcpCodex` / `Agent.layerAcpClaude`.
2. Run ACP tests in parallel with existing tests. Validate parity.
3. Switch `Agent.layerFor` to use ACP layers.
4. Remove `ClaudeProvider`, `CodexProvider`, vendor SDK deps, vendor stream schemas.

## Test Plan

File: `packages/agent/tests/acp-agent.test.ts`

```ts
import { describe, expect, it } from "vite-plus/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Stream } from "effect";
import { Agent } from "../src/agent.js";
import { AgentStreamOptions } from "../src/types.js";

const ACP_LAYERS: [string, Layer.Layer<Agent>][] = [
  ["codex-acp", Agent.layerAcpCodex],
  ["claude-acp", Agent.layerAcpClaude],
];

const makeOptions = (prompt: string): AgentStreamOptions =>
  new AgentStreamOptions({
    cwd: process.cwd(),
    sessionId: Option.none(),
    prompt,
    systemPrompt: Option.none(),
  });

describe("Agent (ACP)", () => {
  ACP_LAYERS.forEach(([name, layer]) => {
    describe(name, () => {
      it("streams text response", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("respond with just the word hello"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const textParts = parts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            part.type === "text-delta",
        );
        const fullText = textParts.map((part) => part.delta).join("");
        expect(fullText.toLowerCase()).toContain("hello");
      }, 30_000);

      it("passes cwd to agent", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(
              new AgentStreamOptions({
                cwd: "/tmp",
                sessionId: Option.none(),
                prompt: "run pwd and tell me the result",
                systemPrompt: Option.none(),
              }),
            )
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const toolResults = parts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "tool-result" }> =>
            part.type === "tool-result",
        );
        expect(toolResults.some((part) => part.result.includes("/tmp"))).toBe(true);
      }, 60_000);

      it("resumes session with sessionId", async () => {
        const firstParts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("respond with just the word ping"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const finishPart = firstParts.find((part) => part.type === "response-metadata");
        expect(finishPart).toBeDefined();
        const sessionId = finishPart?.type === "response-metadata" ? (finishPart.id ?? "") : "";
        expect(sessionId.length).toBeGreaterThan(0);

        const secondParts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(
              new AgentStreamOptions({
                cwd: process.cwd(),
                sessionId: Option.some(sessionId),
                prompt: "what was the last word I asked you to say?",
                systemPrompt: Option.none(),
              }),
            )
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const textParts = secondParts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            part.type === "text-delta",
        );
        expect(
          textParts
            .map((part) => part.delta)
            .join("")
            .toLowerCase(),
        ).toContain("ping");
      }, 60_000);

      it("discovers browser MCP tools", async () => {
        const parts = await Effect.gen(function* () {
          const agent = yield* Agent;
          return yield* agent
            .stream(makeOptions("what MCP tools do you have? list all tool names"))
            .pipe(Stream.runCollect);
        }).pipe(Effect.provide(layer), Effect.runPromise);

        const textParts = parts.filter(
          (part): part is Extract<LanguageModelV3StreamPart, { type: "text-delta" }> =>
            part.type === "text-delta",
        );
        const fullText = textParts.map((part) => part.delta).join("").toLowerCase();

        const expectedTools = [
          "open",
          "playwright",
          "screenshot",
          "console_logs",
          "network_requests",
          "close",
        ];
        for (const tool of expectedTools) {
          expect(fullText).toContain(tool);
        }
      }, 60_000);
    });
  });
});
```

## Open Questions

1. **Session resume over ACP**: `codex-acp` and `claude-agent-acp` may not support `loadSession` capability. Need to verify. If not, the "resumes session" test will need a different approach (keep session alive within a single subprocess lifetime).
2. **System prompt**: `AgentStreamOptions` has `systemPrompt`. ACP `session/prompt` only takes content blocks. May need to prepend system prompt as a text content block, or use a session config option if the adapter supports it.
