import { Option, Predicate, Schema } from "effect";
import {
  AgentText,
  AgentThinking,
  ToolCall,
  ToolResult,
  type ExecutionEvent,
} from "@browser-tester/shared/models";

const serializeToolResult = (value: unknown): string => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export class ClaudeTextBlock extends Schema.Class<ClaudeTextBlock>("ClaudeTextBlock")({
  type: Schema.Literal("text"),
  text: Schema.String,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [new AgentText({ text: this.text })];
  }
}

export class ClaudeThinkingBlock extends Schema.Class<ClaudeThinkingBlock>("ClaudeThinkingBlock")({
  type: Schema.Literal("thinking"),
  thinking: Schema.String,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [new AgentThinking({ text: this.thinking })];
  }
}

export class ClaudeToolUseBlock extends Schema.Class<ClaudeToolUseBlock>("ClaudeToolUseBlock")({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
}) {
  get executionEvents(): ExecutionEvent[] {
    return [new ToolCall({ toolName: this.name, input: this.input })];
  }
}

export class ClaudeToolResultBlock extends Schema.Class<ClaudeToolResultBlock>(
  "ClaudeToolResultBlock",
)({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  name: Schema.optional(Schema.String),
  content: Schema.Unknown,
  is_error: Schema.optional(Schema.Boolean),
}) {
  get executionEvents(): ExecutionEvent[] {
    return [
      new ToolResult({
        toolName: this.name ?? "unknown",
        result: serializeToolResult(this.content),
        isError: Boolean(this.is_error),
      }),
    ];
  }
}

export class ClaudeToolErrorBlock extends Schema.Class<ClaudeToolErrorBlock>(
  "ClaudeToolErrorBlock",
)({
  type: Schema.Literal("tool_error"),
  tool_use_id: Schema.String,
  name: Schema.optional(Schema.String),
  error: Schema.Unknown,
  is_error: Schema.optional(Schema.Boolean),
}) {
  get executionEvents(): ExecutionEvent[] {
    return [
      new ToolResult({
        toolName: this.name ?? "unknown",
        result: serializeToolResult(this.error),
        isError: true,
      }),
    ];
  }
}

export const ClaudeAssistantBlock = Schema.Union([
  ClaudeTextBlock,
  ClaudeThinkingBlock,
  ClaudeToolUseBlock,
]);
export type ClaudeAssistantBlock = typeof ClaudeAssistantBlock.Type;

export const ClaudeToolResponseBlock = Schema.Union([ClaudeToolResultBlock, ClaudeToolErrorBlock]);
export type ClaudeToolResponseBlock = typeof ClaudeToolResponseBlock.Type;

export const ClaudeContentBlock = Schema.Union([
  ClaudeTextBlock,
  ClaudeThinkingBlock,
  ClaudeToolUseBlock,
  ClaudeToolResultBlock,
  ClaudeToolErrorBlock,
]);
export type ClaudeContentBlock = typeof ClaudeContentBlock.Type;

const decodeAssistantBlocks = (content: readonly unknown[]): ExecutionEvent[] =>
  content.filter(Predicate.isReadonlyObject).flatMap((raw) => {
    const parsed = Schema.decodeUnknownOption(ClaudeAssistantBlock)(raw);
    if (Option.isNone(parsed)) return [];
    return parsed.value.executionEvents;
  });

const decodeToolResponseBlocks = (content: readonly unknown[]): ExecutionEvent[] =>
  content
    .filter(Predicate.isReadonlyObject)
    .filter((raw) => raw.type === "tool_result" || raw.type === "tool_error")
    .flatMap((raw) => {
      const parsed = Schema.decodeUnknownOption(ClaudeToolResponseBlock)(raw);
      if (Option.isNone(parsed)) return [];
      return parsed.value.executionEvents;
    });

export class ClaudeAssistantMessage extends Schema.Class<ClaudeAssistantMessage>(
  "ClaudeAssistantMessage",
)({
  type: Schema.Literal("assistant"),
  message: Schema.Struct({ content: Schema.Array(Schema.Unknown) }),
  session_id: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    const events = decodeAssistantBlocks(this.message.content);
    return events.length > 0 ? Option.some(events) : Option.none();
  }
}

export class ClaudeUserMessage extends Schema.Class<ClaudeUserMessage>("ClaudeUserMessage")({
  type: Schema.Literal("user"),
  message: Schema.Struct({ content: Schema.Unknown }),
  session_id: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    if (!Array.isArray(this.message.content)) return Option.none();
    const events = decodeToolResponseBlocks(this.message.content);
    return events.length > 0 ? Option.some(events) : Option.none();
  }
}

export class ClaudeResultSuccess extends Schema.Class<ClaudeResultSuccess>("ClaudeResultSuccess")({
  type: Schema.Literal("result"),
  subtype: Schema.Literal("success"),
  result: Schema.String,
  duration_ms: Schema.Number,
  duration_api_ms: Schema.Number,
  is_error: Schema.Boolean,
  num_turns: Schema.Number,
  total_cost_usd: Schema.Number,
  session_id: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class ClaudeResultError extends Schema.Class<ClaudeResultError>("ClaudeResultError")({
  type: Schema.Literal("result"),
  subtype: Schema.Literals([
    "error_during_execution",
    "error_max_turns",
    "error_max_budget_usd",
    "error_max_structured_output_retries",
  ] as const),
  duration_ms: Schema.Number,
  duration_api_ms: Schema.Number,
  is_error: Schema.Boolean,
  num_turns: Schema.Number,
  total_cost_usd: Schema.Number,
  errors: Schema.Array(Schema.String),
  session_id: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export const ClaudeResultMessage = Schema.Union([ClaudeResultSuccess, ClaudeResultError]);
export type ClaudeResultMessage = typeof ClaudeResultMessage.Type;

export class ClaudeSystemEvent extends Schema.Class<ClaudeSystemEvent>("ClaudeSystemEvent")({
  type: Schema.Literal("system"),
  subtype: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export class ClaudeRateLimitEvent extends Schema.Class<ClaudeRateLimitEvent>(
  "ClaudeRateLimitEvent",
)({
  type: Schema.Literal("rate_limit_event"),
  rate_limit_info: Schema.Struct({
    status: Schema.String,
    resetsAt: Schema.Number,
    rateLimitType: Schema.String,
    overageStatus: Schema.String,
    overageResetsAt: Schema.Number,
    isUsingOverage: Schema.Boolean,
  }),
  uuid: Schema.String,
  session_id: Schema.String,
}) {
  get executionEvents(): Option.Option<ExecutionEvent[]> {
    return Option.none();
  }
}

export const ClaudeStreamEvent = Schema.Union([
  ClaudeAssistantMessage,
  ClaudeUserMessage,
  ClaudeResultSuccess,
  ClaudeResultError,
  ClaudeSystemEvent,
  ClaudeRateLimitEvent,
]);
export type ClaudeStreamEvent = typeof ClaudeStreamEvent.Type;
