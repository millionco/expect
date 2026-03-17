import type { LanguageModelV3Content, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Option, Predicate, Schema } from "effect";
import { serializeToolResult } from "../utils/serialize-tool-result.js";

export class ClaudeTextBlock extends Schema.Class<ClaudeTextBlock>("ClaudeTextBlock")({
  type: Schema.Literal("text"),
  text: Schema.String,
}) {
  get aiSdkContent(): LanguageModelV3Content {
    return { type: "text", text: this.text };
  }

  streamParts(blockId: string): LanguageModelV3StreamPart[] {
    return [
      { type: "text-start", id: blockId },
      { type: "text-delta", id: blockId, delta: this.text },
      { type: "text-end", id: blockId },
    ];
  }
}

export class ClaudeThinkingBlock extends Schema.Class<ClaudeThinkingBlock>("ClaudeThinkingBlock")({
  type: Schema.Literal("thinking"),
  thinking: Schema.String,
}) {
  get aiSdkContent(): LanguageModelV3Content {
    return { type: "reasoning", text: this.thinking };
  }

  streamParts(blockId: string): LanguageModelV3StreamPart[] {
    return [
      { type: "reasoning-start", id: blockId },
      { type: "reasoning-delta", id: blockId, delta: this.thinking },
      { type: "reasoning-end", id: blockId },
    ];
  }
}

export class ClaudeToolUseBlock extends Schema.Class<ClaudeToolUseBlock>("ClaudeToolUseBlock")({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
}) {
  get inputString() {
    return JSON.stringify(this.input ?? {});
  }

  get aiSdkContent(): LanguageModelV3Content {
    return {
      type: "tool-call",
      toolCallId: this.id,
      toolName: this.name,
      input: this.inputString,
      providerExecuted: true,
    };
  }

  streamParts(_blockId: string): LanguageModelV3StreamPart[] {
    return [
      { type: "tool-input-start", id: this.id, toolName: this.name, providerExecuted: true },
      { type: "tool-input-delta", id: this.id, delta: this.inputString },
      { type: "tool-input-end", id: this.id },
      {
        type: "tool-call",
        toolCallId: this.id,
        toolName: this.name,
        input: this.inputString,
        providerExecuted: true,
      },
    ];
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
  get aiSdkContent(): LanguageModelV3Content {
    return {
      type: "tool-result",
      toolCallId: this.tool_use_id,
      toolName: this.name ?? "unknown",
      result: serializeToolResult(this.content),
      isError: this.is_error ?? false,
    };
  }

  get streamPart(): LanguageModelV3StreamPart {
    return {
      type: "tool-result",
      toolCallId: this.tool_use_id,
      toolName: this.name ?? "unknown",
      result: serializeToolResult(this.content),
      isError: this.is_error ?? false,
    };
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
  get aiSdkContent(): LanguageModelV3Content {
    return {
      type: "tool-result",
      toolCallId: this.tool_use_id,
      toolName: this.name ?? "unknown",
      result: serializeToolResult(this.error),
      isError: true,
    };
  }

  get streamPart(): LanguageModelV3StreamPart {
    return {
      type: "tool-result",
      toolCallId: this.tool_use_id,
      toolName: this.name ?? "unknown",
      result: serializeToolResult(this.error),
      isError: true,
    };
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

let blockIdCounter = 0;

const decodeAssistantBlocks = (content: readonly unknown[]): LanguageModelV3StreamPart[] =>
  content.filter(Predicate.isReadonlyObject).flatMap((raw) => {
    const parsed = Schema.decodeUnknownOption(ClaudeAssistantBlock)(raw);
    if (Option.isNone(parsed)) return [];
    return parsed.value.streamParts(`block-${blockIdCounter++}`);
  });

const decodeToolResponseBlocks = (content: readonly unknown[]): LanguageModelV3StreamPart[] =>
  content
    .filter(Predicate.isReadonlyObject)
    .filter((raw) => raw.type === "tool_result" || raw.type === "tool_error")
    .flatMap((raw) => {
      const parsed = Schema.decodeUnknownOption(ClaudeToolResponseBlock)(raw);
      if (Option.isNone(parsed)) return [];
      return [parsed.value.streamPart];
    });

export class ClaudeAssistantMessage extends Schema.Class<ClaudeAssistantMessage>(
  "ClaudeAssistantMessage",
)({
  type: Schema.Literal("assistant"),
  message: Schema.Struct({ content: Schema.Array(Schema.Unknown) }),
  session_id: Schema.String,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    const parts = decodeAssistantBlocks(this.message.content);
    return parts.length > 0 ? Option.some(parts) : Option.none();
  }
}

export class ClaudeUserMessage extends Schema.Class<ClaudeUserMessage>("ClaudeUserMessage")({
  type: Schema.Literal("user"),
  message: Schema.Struct({ content: Schema.Unknown }),
  session_id: Schema.String,
}) {
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    if (!Array.isArray(this.message.content)) return Option.none();
    const parts = decodeToolResponseBlocks(this.message.content);
    return parts.length > 0 ? Option.some(parts) : Option.none();
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
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
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
  get streamParts(): Option.Option<LanguageModelV3StreamPart[]> {
    return Option.some([{ type: "error", error: this.errors.join("\n") }]);
  }
}

export const ClaudeResultMessage = Schema.Union([ClaudeResultSuccess, ClaudeResultError]);
export type ClaudeResultMessage = typeof ClaudeResultMessage.Type;

export const ClaudeStreamEvent = Schema.Union([
  ClaudeAssistantMessage,
  ClaudeUserMessage,
  ClaudeResultSuccess,
  ClaudeResultError,
]);
export type ClaudeStreamEvent = typeof ClaudeStreamEvent.Type;
