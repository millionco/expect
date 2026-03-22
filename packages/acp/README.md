# @browser-tester/acp

Agent Communication Protocol (ACP) server and transport. Provides a JSON-RPC based protocol for building and communicating with coding agents.

## Install

```bash
pnpm add @browser-tester/acp
```

## Examples

### Connect to an ACP agent

Spawn an ACP-compatible agent and interact with it using typed methods:

```ts
import { Effect, Stream } from "effect";
import { connectAcpAgent, AcpAgentConfig } from "@browser-tester/acp";

const program = Effect.gen(function* () {
  const client = yield* connectAcpAgent(
    new AcpAgentConfig({
      command: "claude",
      args: [],
      displayName: "Claude Code",
    }),
  );

  const { agentInfo } = yield* client.initialize({
    clientInfo: { name: "my-app", version: "1.0.0" },
  });

  yield* client.authenticate();

  const { sessionId } = yield* client.createSession({ cwd: "/my/project" });

  yield* client.prompt(sessionId, "What files are in this project?");

  yield* client.updates.pipe(
    Stream.tap((event) =>
      Effect.logInfo("Update", { type: event.sessionUpdate, text: event.text }),
    ),
    Stream.runDrain,
  );

  yield* client.close;
});
```

### Use a known agent

`KNOWN_ACP_AGENTS` has pre-configured entries for popular coding agents:

```ts
import { KNOWN_ACP_AGENTS, connectAcpAgent } from "@browser-tester/acp";

const client = yield * connectAcpAgent(KNOWN_ACP_AGENTS["claude-code"]);
```

Available keys: `gemini-cli`, `claude-code`, `codex-cli`, `cursor-acp`, `opencode`, `kiro-cli`, `copilot`

### Send rich content

The `prompt` method accepts a plain string or an array of `ContentBlock`:

```ts
yield * client.prompt(sessionId, "Run the tests");

yield *
  client.prompt(sessionId, [
    { type: "text", text: "Look at this file:" },
    { type: "resource_link", uri: "file:///src/index.ts", name: "index.ts" },
  ]);
```

### Use the transport directly

`StdioTransport` handles JSON-RPC framing over stdin/stdout for building an ACP server:

```ts
import { Effect, Stream } from "effect";
import { StdioTransport } from "@browser-tester/acp";

const program = Effect.gen(function* () {
  const transport = yield* StdioTransport;

  yield* Effect.forkChild(transport.startReading);

  yield* transport.sendResponse(1, { protocolVersion: 1 });
  yield* transport.sendNotification("session/update", {
    sessionId: "sess_abc",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } },
  });

  yield* transport.incomingMessages.pipe(
    Stream.tap((line) => Effect.logDebug("Received", { line })),
    Stream.runDrain,
  );
});

Effect.runPromise(program.pipe(Effect.provide(StdioTransport.layer)));
```

### Validate protocol messages

All protocol messages are Effect schemas:

```ts
import { Schema } from "effect";
import { InitializeRequest, PromptRequest, SessionUpdate } from "@browser-tester/acp";

const request =
  yield *
  Schema.decodeUnknownEffect(InitializeRequest)({
    protocolVersion: 1,
    clientInfo: { name: "my-client" },
  });

const update =
  yield *
  Schema.decodeUnknownEffect(SessionUpdate)({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "Working on it..." },
  });
```

## API

### `connectAcpAgent(config)`

Spawn an ACP agent subprocess and return a typed client connection.

```ts
interface AcpClientConnection {
  initialize(options?): Effect<InitializeResponse, AcpClientError>;
  authenticate(methodId?): Effect<AuthenticateResponse, AcpClientError>;
  createSession(options?): Effect<NewSessionResponse, AcpClientError>;
  prompt(sessionId, content): Effect<PromptResponse, AcpClientError>;
  setMode(sessionId, modeId): Effect<SetSessionModeResponse, AcpClientError>;
  cancel(sessionId): Effect<void, AcpClientError>;
  updates: Stream<SessionUpdateEvent, AcpClientError>;
  close: Effect<void>;
  sendRequest(method, params): Effect<unknown, AcpClientError>;
  sendNotification(method, params): Effect<void, AcpClientError>;
}
```

### `AcpAgentConfig`

Configuration for spawning an ACP agent:

```ts
class AcpAgentConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  displayName: string;
}
```

### `KNOWN_ACP_AGENTS`

Registry of pre-configured `AcpAgentConfig` entries keyed by agent name.

### `StdioTransport`

Effect service for JSON-RPC communication over stdio.

| Method             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `sendResponse`     | Send a JSON-RPC response for a request ID         |
| `sendError`        | Send a JSON-RPC error for a request ID            |
| `sendNotification` | Send a notification (no ID, no response expected) |
| `sendRequest`      | Send a request and await the response             |
| `startReading`     | Begin reading newline-delimited JSON from stdin   |
| `incomingMessages` | Stream of raw incoming message strings            |

## Protocol Schemas

Effect schemas for all ACP messages, grouped by protocol phase:

**Lifecycle:** `InitializeRequest` `InitializeResponse` `AuthenticateRequest` `AuthenticateResponse`

**Sessions:** `NewSessionRequest` `NewSessionResponse` `LoadSessionRequest` `LoadSessionResponse`

**Prompts:** `PromptRequest` `PromptResponse` `CancelNotification`

**Session Management:** `SetSessionModeRequest` `SetSessionModeResponse` `SessionNotification` `RequestPermissionRequest` `RequestPermissionResponse`

**Content and Tools:** `ContentBlock` `ToolKind` `ToolCallStatus` `PlanEntry` `SessionUpdate` `PermissionOption` `RequestPermissionOutcome`

**Identifiers:** `SessionId` `ProtocolVersion` `RequestId` `Implementation` `ClientCapabilities` `AgentCapabilities` `PromptCapabilities` `McpCapabilities` `SessionMode` `SessionModeState` `EnvVariable` `McpServer` `StopReason`

## Errors

| Error                  | Description                     |
| ---------------------- | ------------------------------- |
| `AcpClientError`       | ACP client communication failed |
| `JsonRpcParseError`    | Invalid JSON-RPC message        |
| `TransportClosedError` | Transport connection closed     |

## Constants

| Constant           | Value   | Description              |
| ------------------ | ------- | ------------------------ |
| `PROTOCOL_VERSION` | `1`     | Current protocol version |
| `JSON_RPC_VERSION` | `"2.0"` | JSON-RPC version         |
| `ERROR_CODE_*`     |         | Standard JSON-RPC codes  |
