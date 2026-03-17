import type { LanguageModelV3Content, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Option, Schema } from "effect";

const CommandExecutionStatus = Schema.Literals(["in_progress", "completed", "failed"] as const);
const PatchApplyStatus = Schema.Literals(["completed", "failed"] as const);
const McpToolCallStatus = Schema.Literals(["in_progress", "completed", "failed"] as const);
const PatchChangeKind = Schema.Literals(["add", "delete", "update"] as const);

export class CodexCommandExecution extends Schema.Class<CodexCommandExecution>(
  "CodexCommandExecution",
)({
  id: Schema.String,
  type: Schema.Literal("command_execution"),
  command: Schema.String,
  aggregated_output: Schema.String,
  exit_code: Schema.optional(Schema.Number),
  status: CommandExecutionStatus,
}) {
  get isError() {
    return this.status === "failed" || (this.exit_code !== undefined && this.exit_code !== 0);
  }

  get toolName() {
    return "exec";
  }

  get toolInput() {
    return JSON.stringify({ command: this.command });
  }

  get toolResult() {
    return JSON.stringify({
      command: this.command,
      aggregatedOutput: this.aggregated_output,
      exitCode: this.exit_code,
      status: this.status,
    });
  }

  get aiSdkContent(): LanguageModelV3Content[] {
    return [
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: this.isError,
      },
    ];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [
      { type: "tool-input-start", id: this.id, toolName: this.toolName, providerExecuted: true },
      { type: "tool-input-delta", id: this.id, delta: this.toolInput },
      { type: "tool-input-end", id: this.id },
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: this.isError,
      },
    ];
  }
}

export class CodexFileChange extends Schema.Class<CodexFileChange>("CodexFileChange")({
  id: Schema.String,
  type: Schema.Literal("file_change"),
  changes: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      kind: PatchChangeKind,
    }),
  ),
  status: PatchApplyStatus,
}) {
  get isError() {
    return this.status === "failed";
  }

  get toolName() {
    return "patch";
  }

  get toolInput() {
    return JSON.stringify({ changes: this.changes });
  }

  get toolResult() {
    return JSON.stringify({ changes: this.changes, status: this.status });
  }

  get aiSdkContent(): LanguageModelV3Content[] {
    return [
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: this.isError,
      },
    ];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [
      { type: "tool-input-start", id: this.id, toolName: this.toolName, providerExecuted: true },
      { type: "tool-input-delta", id: this.id, delta: this.toolInput },
      { type: "tool-input-end", id: this.id },
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: this.isError,
      },
    ];
  }
}

export class CodexMcpToolCall extends Schema.Class<CodexMcpToolCall>("CodexMcpToolCall")({
  id: Schema.String,
  type: Schema.Literal("mcp_tool_call"),
  server: Schema.String,
  tool: Schema.String,
  arguments: Schema.Unknown,
  result: Schema.optional(
    Schema.Struct({
      content: Schema.Array(Schema.Unknown),
      structured_content: Schema.Unknown,
    }),
  ),
  error: Schema.optional(Schema.Struct({ message: Schema.String })),
  status: McpToolCallStatus,
}) {
  get isError() {
    return this.status === "failed";
  }

  get toolName() {
    return `mcp__${this.server}__${this.tool}`;
  }

  get toolInput() {
    return JSON.stringify({ server: this.server, tool: this.tool, arguments: this.arguments });
  }

  get toolResult() {
    return JSON.stringify({
      server: this.server,
      tool: this.tool,
      status: this.status,
      ...(this.result ? { result: this.result } : {}),
      ...(this.error ? { error: this.error } : {}),
    });
  }

  get aiSdkContent(): LanguageModelV3Content[] {
    return [
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: this.isError,
      },
    ];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [
      { type: "tool-input-start", id: this.id, toolName: this.toolName, providerExecuted: true },
      { type: "tool-input-delta", id: this.id, delta: this.toolInput },
      { type: "tool-input-end", id: this.id },
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: this.isError,
      },
    ];
  }
}

export class CodexAgentMessage extends Schema.Class<CodexAgentMessage>("CodexAgentMessage")({
  id: Schema.String,
  type: Schema.Literal("agent_message"),
  text: Schema.String,
}) {
  get aiSdkContent(): LanguageModelV3Content[] {
    return [{ type: "text", text: this.text }];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [
      { type: "text-start", id: this.id },
      { type: "text-delta", id: this.id, delta: this.text },
      { type: "text-end", id: this.id },
    ];
  }
}

export class CodexReasoning extends Schema.Class<CodexReasoning>("CodexReasoning")({
  id: Schema.String,
  type: Schema.Literal("reasoning"),
  text: Schema.String,
}) {
  get aiSdkContent(): LanguageModelV3Content[] {
    return [{ type: "reasoning", text: this.text }];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [
      { type: "reasoning-start", id: this.id },
      { type: "reasoning-delta", id: this.id, delta: this.text },
      { type: "reasoning-end", id: this.id },
    ];
  }
}

export class CodexWebSearch extends Schema.Class<CodexWebSearch>("CodexWebSearch")({
  id: Schema.String,
  type: Schema.Literal("web_search"),
  query: Schema.String,
}) {
  get toolName() {
    return "web_search";
  }

  get toolInput() {
    return JSON.stringify({ query: this.query });
  }

  get toolResult() {
    return JSON.stringify({ query: this.query });
  }

  get aiSdkContent(): LanguageModelV3Content[] {
    return [
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: false,
      },
    ];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [
      { type: "tool-input-start", id: this.id, toolName: this.toolName, providerExecuted: true },
      { type: "tool-input-delta", id: this.id, delta: this.toolInput },
      { type: "tool-input-end", id: this.id },
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.toolName,
        input: this.toolInput,
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: this.id,
        toolName: this.toolName,
        result: this.toolResult,
        isError: false,
      },
    ];
  }
}

export class CodexErrorItem extends Schema.Class<CodexErrorItem>("CodexErrorItem")({
  id: Schema.String,
  type: Schema.Literal("error"),
  message: Schema.String,
}) {
  get aiSdkContent(): LanguageModelV3Content[] {
    return [];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [];
  }
}

export class CodexTodoList extends Schema.Class<CodexTodoList>("CodexTodoList")({
  id: Schema.String,
  type: Schema.Literal("todo_list"),
  items: Schema.Array(Schema.Struct({ text: Schema.String, completed: Schema.Boolean })),
}) {
  get aiSdkContent(): LanguageModelV3Content[] {
    return [];
  }

  get streamParts(): LanguageModelV3StreamPart[] {
    return [];
  }
}

export const CodexThreadItem = Schema.Union([
  CodexCommandExecution,
  CodexFileChange,
  CodexMcpToolCall,
  CodexAgentMessage,
  CodexReasoning,
  CodexWebSearch,
  CodexErrorItem,
  CodexTodoList,
]);
export type CodexThreadItem = typeof CodexThreadItem.Type;

export class CodexThreadStartedEvent extends Schema.Class<CodexThreadStartedEvent>(
  "CodexThreadStartedEvent",
)({
  type: Schema.Literal("thread.started"),
  thread_id: Schema.String,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.some([
      {
        type: "response-metadata",
        id: this.thread_id,
        timestamp: new Date(),
        modelId: "codex",
      },
    ]);
  }
}

export class CodexTurnStartedEvent extends Schema.Class<CodexTurnStartedEvent>(
  "CodexTurnStartedEvent",
)({
  type: Schema.Literal("turn.started"),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class CodexUsage extends Schema.Class<CodexUsage>("CodexUsage")({
  input_tokens: Schema.Number,
  cached_input_tokens: Schema.Number,
  output_tokens: Schema.Number,
}) {}

export class CodexTurnCompletedEvent extends Schema.Class<CodexTurnCompletedEvent>(
  "CodexTurnCompletedEvent",
)({
  type: Schema.Literal("turn.completed"),
  usage: CodexUsage,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.some([
      {
        type: "finish",
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: this.usage.input_tokens,
            noCache: undefined,
            cacheRead: this.usage.cached_input_tokens,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: this.usage.output_tokens,
            text: undefined,
            reasoning: undefined,
          },
        },
        providerMetadata: undefined,
      },
    ]);
  }
}

export class CodexTurnFailedEvent extends Schema.Class<CodexTurnFailedEvent>(
  "CodexTurnFailedEvent",
)({
  type: Schema.Literal("turn.failed"),
  error: Schema.Struct({ message: Schema.String }),
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.some([{ type: "error", error: this.error.message }]);
  }
}

export class CodexItemStartedEvent extends Schema.Class<CodexItemStartedEvent>(
  "CodexItemStartedEvent",
)({
  type: Schema.Literal("item.started"),
  item: CodexThreadItem,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class CodexItemUpdatedEvent extends Schema.Class<CodexItemUpdatedEvent>(
  "CodexItemUpdatedEvent",
)({
  type: Schema.Literal("item.updated"),
  item: CodexThreadItem,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.none();
  }
}

export class CodexItemCompletedEvent extends Schema.Class<CodexItemCompletedEvent>(
  "CodexItemCompletedEvent",
)({
  type: Schema.Literal("item.completed"),
  item: CodexThreadItem,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    const parts = this.item.streamParts;
    return parts.length > 0 ? Option.some(parts) : Option.none();
  }
}

export class CodexThreadErrorEvent extends Schema.Class<CodexThreadErrorEvent>(
  "CodexThreadErrorEvent",
)({
  type: Schema.Literal("error"),
  message: Schema.String,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.some([{ type: "error", error: this.message }]);
  }
}

export const CodexThreadEvent = Schema.Union([
  CodexThreadStartedEvent,
  CodexTurnStartedEvent,
  CodexTurnCompletedEvent,
  CodexTurnFailedEvent,
  CodexItemStartedEvent,
  CodexItemUpdatedEvent,
  CodexItemCompletedEvent,
  CodexThreadErrorEvent,
]);
export type CodexThreadEvent = typeof CodexThreadEvent.Type;
