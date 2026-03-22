import { Effect, Layer, Option, ServiceMap, Stream } from "effect";
import {
  AcpClientError,
  PROTOCOL_VERSION,
  type AcpAgentConfig,
  type SessionUpdateEvent,
  connectAcpAgent,
} from "@browser-tester/acp";
import { AgentStreamOptions } from "@browser-tester/shared/agent";
import {
  AgentText,
  AgentThinking,
  ToolCall,
  ToolResult,
  type ExecutionEvent,
} from "@browser-tester/shared/models";

const mapUpdateToEvents = (event: SessionUpdateEvent): readonly ExecutionEvent[] => {
  if (event.sessionUpdate === "agent_message_chunk" && event.text !== undefined) {
    return [new AgentText({ text: event.text })];
  }

  if (event.sessionUpdate === "agent_thought_chunk" && event.text !== undefined) {
    return [new AgentThinking({ text: event.text })];
  }

  if (event.sessionUpdate === "tool_call" && event.toolCallId) {
    return [new ToolCall({ toolName: event.title ?? "unknown", input: event.rawInput ?? {} })];
  }

  if (
    event.sessionUpdate === "tool_call_update" &&
    event.toolCallId &&
    event.status === "completed"
  ) {
    return [
      new ToolResult({
        toolName: event.title ?? "unknown",
        result:
          typeof event.rawOutput === "string"
            ? event.rawOutput
            : JSON.stringify(event.rawOutput ?? ""),
        isError: false,
      }),
    ];
  }

  if (event.sessionUpdate === "tool_call_update" && event.toolCallId && event.status === "error") {
    return [
      new ToolResult({
        toolName: event.title ?? "unknown",
        result: typeof event.rawOutput === "string" ? event.rawOutput : "Tool call failed",
        isError: true,
      }),
    ];
  }

  return [];
};

export class AcpProvider extends ServiceMap.Service<
  AcpProvider,
  {
    readonly stream: (options: AgentStreamOptions) => Stream.Stream<ExecutionEvent, AcpClientError>;
  }
>()("@browser-tester/AcpProvider") {
  static layerFor = (config: AcpAgentConfig) =>
    Layer.effect(AcpProvider)(
      Effect.succeed(
        AcpProvider.of({
          stream: (options) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const connection = yield* connectAcpAgent(config);

                yield* connection.initialize({
                  protocolVersion: PROTOCOL_VERSION,
                  clientCapabilities: {
                    fs: { readTextFile: false, writeTextFile: false },
                    terminal: false,
                  },
                  clientInfo: { name: "testie", version: "0.0.1" },
                });

                const sessionResult = yield* connection.createSession({
                  cwd: options.cwd,
                });

                const promptContent = [
                  { type: "text" as const, text: options.prompt },
                  ...(Option.isSome(options.systemPrompt)
                    ? [{ type: "text" as const, text: options.systemPrompt.value }]
                    : []),
                ];

                yield* Effect.forkChild(
                  connection.prompt(sessionResult.sessionId, promptContent).pipe(
                    Effect.tap(() => Effect.sync(() => connection.process.stdin?.end())),
                    Effect.catchTag("AcpClientError", (clientError) =>
                      Effect.logWarning("ACP prompt request failed", {
                        error: clientError.message,
                      }),
                    ),
                  ),
                );

                return connection.updates.pipe(
                  Stream.flatMap((event) => Stream.fromIterable(mapUpdateToEvents(event))),
                  Stream.ensuring(connection.close),
                );
              }),
            ),
        }),
      ),
    );
}
