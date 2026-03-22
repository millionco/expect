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
  Schema.Struct({
    type: Schema.Literal("image"),
    data: Schema.String,
    mimeType: Schema.String,
  }),
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
    oldText: Schema.optional(Schema.NullOr(Schema.String)),
    newText: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("terminal"),
    terminalId: Schema.String,
  }),
]);

const AcpToolCallLocation = Schema.Struct({
  path: Schema.String,
  lineNumber: Schema.optional(Schema.NullOr(Schema.Number)),
});

let blockIdCounter = 0;

export class AcpAgentMessageChunk extends Schema.Class<AcpAgentMessageChunk>(
  "AcpAgentMessageChunk",
)({
  sessionUpdate: Schema.Literal("agent_message_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.NullOr(Schema.String)),
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
  messageId: Schema.optional(Schema.NullOr(Schema.String)),
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

export class AcpUserMessageChunk extends Schema.Class<AcpUserMessageChunk>("AcpUserMessageChunk")({
  sessionUpdate: Schema.Literal("user_message_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.NullOr(Schema.String)),
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
      {
        type: "tool-input-delta" as const,
        id: this.toolCallId,
        delta: inputString,
      },
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

const AcpPlanEntryStatus = Schema.Literals(["pending", "in_progress", "completed"] as const);

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
