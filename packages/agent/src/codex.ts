import { Codex } from "@openai/codex-sdk";
import type { ThreadItem, UserInput } from "@openai/codex-sdk";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { Effect, Layer, ServiceMap } from "effect";
import { convertPrompt } from "./convert-prompt.js";
import { CodexRunError } from "./errors.js";
import { EMPTY_USAGE, PROVIDER_ID, STOP_REASON } from "./provider-shared.js";
import type { AgentProviderSettings } from "./types.js";

const runGenerate = Effect.fn("CodexAgent.generate")(function* (
  options: LanguageModelV3CallOptions,
  settings: AgentProviderSettings,
) {
  const { thread, input, userPrompt } = prepareRun(settings, options);

  const result = yield* Effect.tryPromise({
    try: () => thread.run(input, { signal: options.abortSignal }),
    catch: (cause) => new CodexRunError({ cause }),
  });

  return {
    content: result.items.flatMap(convertItem),
    finishReason: STOP_REASON,
    usage: result.usage
      ? {
          inputTokens: {
            total: result.usage.input_tokens,
            noCache: undefined,
            cacheRead: result.usage.cached_input_tokens,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: result.usage.output_tokens,
            text: undefined,
            reasoning: undefined,
          },
        }
      : EMPTY_USAGE,
    warnings: [],
    request: { body: userPrompt },
    response: { id: thread.id ?? crypto.randomUUID(), timestamp: new Date(), modelId: "codex" },
    providerMetadata: thread.id ? { [PROVIDER_ID]: { sessionId: thread.id } } : undefined,
  };
});

const runStream = Effect.fn("CodexAgent.stream")(function* (
  options: LanguageModelV3CallOptions,
  settings: AgentProviderSettings,
) {
  const { thread, input, userPrompt } = prepareRun(settings, options);

  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start: (controller) => {
      let sessionId: string | undefined;

      return Effect.runPromise(
        Effect.tryPromise({
          try: async () => {
            controller.enqueue({ type: "stream-start", warnings: [] });
            const { events } = await thread.runStreamed(input, { signal: options.abortSignal });

            for await (const event of events) {
              if (event.type === "thread.started") {
                sessionId = event.thread_id;
                controller.enqueue({
                  type: "response-metadata",
                  id: sessionId,
                  timestamp: new Date(),
                  modelId: "codex",
                });
              }
              if (event.type === "item.completed") emitItemParts(event.item, controller);
            }

            if (!sessionId && thread.id) sessionId = thread.id;
            controller.enqueue({
              type: "finish",
              finishReason: STOP_REASON,
              usage: EMPTY_USAGE,
              providerMetadata: sessionId ? { [PROVIDER_ID]: { sessionId } } : undefined,
            });
          },
          catch: (cause) => new CodexRunError({ cause }),
        }).pipe(
          Effect.catchTag("CodexRunError", (error) =>
            Effect.sync(() => controller.enqueue({ type: "error", error })),
          ),
        ),
      )
        .catch((defect) => controller.enqueue({ type: "error", error: defect }))
        .finally(() => controller.close());
    },
  });

  return { stream, request: { body: userPrompt } };
});

const buildCodexAgent = (settings: AgentProviderSettings) => ({
  generate: (options: LanguageModelV3CallOptions) => runGenerate(options, settings),
  stream: (options: LanguageModelV3CallOptions) => runStream(options, settings),
});

export class CodexAgent extends ServiceMap.Service<CodexAgent>()("@browser-tester/CodexAgent", {
  make: Effect.succeed(buildCodexAgent({})),
}) {
  static live = (settings: AgentProviderSettings) =>
    Layer.succeed(CodexAgent)(buildCodexAgent(settings));
}

export const createCodexModel = (settings: AgentProviderSettings = {}): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: PROVIDER_ID,
  modelId: "codex",
  supportedUrls: {},
  doGenerate: (options) => Effect.runPromise(runGenerate(options, settings)),
  doStream: (options) => Effect.runPromise(runStream(options, settings)),
});

const prepareRun = (settings: AgentProviderSettings, options: LanguageModelV3CallOptions) => {
  const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
  // HACK: Codex SDK config types only accept primitives, but mcp_servers needs nested objects
  const codex = new Codex(
    settings.mcpServers
      ? { config: { mcp_servers: JSON.parse(JSON.stringify(settings.mcpServers)) } }
      : undefined,
  );
  const thread = settings.sessionId
    ? codex.resumeThread(settings.sessionId, { workingDirectory: settings.cwd })
    : codex.startThread({ workingDirectory: settings.cwd });
  const input: UserInput[] = systemPrompt
    ? [
        { type: "text", text: systemPrompt },
        { type: "text", text: userPrompt },
      ]
    : [{ type: "text", text: userPrompt }];

  return { thread, input, userPrompt };
};

const convertItem = (item: ThreadItem): LanguageModelV3Content[] => {
  if (item.type === "agent_message") return [{ type: "text", text: item.text }];
  if (item.type === "reasoning") return [{ type: "reasoning", text: item.text }];

  if (item.type === "command_execution") {
    const isError =
      item.status === "failed" || (item.exit_code !== undefined && item.exit_code !== 0);
    return toolPair(
      item.id,
      "exec",
      { command: item.command },
      {
        command: item.command,
        aggregatedOutput: item.aggregated_output,
        exitCode: item.exit_code,
        status: item.status,
      },
      isError,
    );
  }

  if (item.type === "file_change")
    return toolPair(
      item.id,
      "patch",
      { changes: item.changes },
      { changes: item.changes, status: item.status },
      item.status === "failed",
    );

  if (item.type === "mcp_tool_call") {
    return toolPair(
      item.id,
      `mcp__${item.server}__${item.tool}`,
      { server: item.server, tool: item.tool, arguments: item.arguments },
      {
        server: item.server,
        tool: item.tool,
        status: item.status,
        ...(item.result ? { result: item.result } : {}),
        ...(item.error ? { error: item.error } : {}),
      },
      item.status === "failed",
    );
  }

  if (item.type === "web_search")
    return toolPair(item.id, "web_search", { query: item.query }, { query: item.query }, false);

  return [];
};

const toolPair = (
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  result: Record<string, unknown>,
  isError: boolean,
): LanguageModelV3Content[] => [
  { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input), providerExecuted: true },
  { type: "tool-result", toolCallId, toolName, result: JSON.stringify(result), isError },
];

const emitItemParts = (
  item: ThreadItem,
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
): void => {
  if (item.type === "agent_message") {
    controller.enqueue({ type: "text-start", id: item.id });
    controller.enqueue({ type: "text-delta", id: item.id, delta: item.text });
    controller.enqueue({ type: "text-end", id: item.id });
    return;
  }

  if (item.type === "reasoning") {
    controller.enqueue({ type: "reasoning-start", id: item.id });
    controller.enqueue({ type: "reasoning-delta", id: item.id, delta: item.text });
    controller.enqueue({ type: "reasoning-end", id: item.id });
    return;
  }

  const toolCallId = item.id;
  const converted = convertItem(item);
  if (converted.length === 0) return;

  const toolCall = converted[0];
  if (toolCall.type !== "tool-call") return;

  controller.enqueue({
    type: "tool-input-start",
    id: toolCallId,
    toolName: toolCall.toolName,
    providerExecuted: true,
  });
  controller.enqueue({ type: "tool-input-delta", id: toolCallId, delta: toolCall.input });
  controller.enqueue({ type: "tool-input-end", id: toolCallId });
  controller.enqueue(toolCall);

  const toolResult = converted[1];
  if (toolResult?.type === "tool-result") controller.enqueue(toolResult);
};
