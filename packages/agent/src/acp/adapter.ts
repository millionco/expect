import type { LanguageModelV3Content, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Predicate } from "effect";
import type { McpServerConfig } from "../types";
import type { AcpMcpServer, SessionUpdate, StopReason, ToolCallContent } from "./schemas";

type UnifiedStopReason = "stop" | "length" | "content-filter";

const STOP_REASON_MAP: Record<StopReason, UnifiedStopReason> = {
  end_turn: "stop",
  max_tokens: "length",
  max_model_requests: "stop",
  refused: "content-filter",
  cancelled: "stop",
};

export const mapStopReason = (reason: StopReason) => ({
  unified: STOP_REASON_MAP[reason],
  raw: reason,
});

const extractToolCallResultText = (content: readonly ToolCallContent[]): string =>
  content
    .filter((item) => item.type === "content")
    .map((item) => item.content.text)
    .join("\n");

const stringifyRawInput = (rawInput: unknown): string => {
  if (typeof rawInput === "string") return rawInput;
  if (Predicate.isObject(rawInput)) {
    try {
      return JSON.stringify(rawInput);
    } catch {
      return String(rawInput);
    }
  }
  return String(rawInput ?? "{}");
};

export const adaptUpdateToContent = (update: SessionUpdate): LanguageModelV3Content[] => {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type === "text") {
        return [{ type: "text", text: update.content.text }];
      }
      return [];
    }
    case "thought_message_chunk": {
      return [{ type: "reasoning", text: update.content.text }];
    }
    case "tool_call": {
      return [
        {
          type: "tool-call",
          toolCallId: update.toolCallId,
          toolName: update.title ?? "unknown",
          input: stringifyRawInput(update.rawInput),
          providerExecuted: true,
        },
      ];
    }
    case "tool_call_update": {
      if (update.status === "completed" || update.status === "failed") {
        const resultText = update.content ? extractToolCallResultText(update.content) : "";
        return [
          {
            type: "tool-result",
            toolCallId: update.toolCallId,
            toolName: update.title ?? "unknown",
            result: update.rawOutput ? stringifyRawInput(update.rawOutput) : resultText,
            isError: update.status === "failed",
          },
        ];
      }
      return [];
    }
    case "user_message_chunk":
    case "plan":
    case "current_mode_update":
      return [];
  }
};

export const adaptUpdatesToContent = (
  updates: readonly SessionUpdate[],
): LanguageModelV3Content[] => updates.flatMap(adaptUpdateToContent);

export const emitUpdateStreamParts = (
  update: SessionUpdate,
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
  blockCounter: number,
): number => {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type === "text") {
        const blockId = `block-${blockCounter++}`;
        controller.enqueue({ type: "text-start", id: blockId });
        controller.enqueue({ type: "text-delta", id: blockId, delta: update.content.text });
        controller.enqueue({ type: "text-end", id: blockId });
      }
      break;
    }
    case "thought_message_chunk": {
      const blockId = `block-${blockCounter++}`;
      controller.enqueue({ type: "reasoning-start", id: blockId });
      controller.enqueue({ type: "reasoning-delta", id: blockId, delta: update.content.text });
      controller.enqueue({ type: "reasoning-end", id: blockId });
      break;
    }
    case "tool_call": {
      const inputStr = stringifyRawInput(update.rawInput);
      controller.enqueue({
        type: "tool-input-start",
        id: update.toolCallId,
        toolName: update.title ?? "unknown",
        providerExecuted: true,
      });
      controller.enqueue({
        type: "tool-input-delta",
        id: update.toolCallId,
        delta: inputStr,
      });
      controller.enqueue({ type: "tool-input-end", id: update.toolCallId });
      controller.enqueue({
        type: "tool-call",
        toolCallId: update.toolCallId,
        toolName: update.title ?? "unknown",
        input: inputStr,
        providerExecuted: true,
      });
      break;
    }
    case "tool_call_update": {
      if (update.status === "completed" || update.status === "failed") {
        const resultText = update.content ? extractToolCallResultText(update.content) : "";
        controller.enqueue({
          type: "tool-result",
          toolCallId: update.toolCallId,
          toolName: update.title ?? "unknown",
          result: update.rawOutput ? stringifyRawInput(update.rawOutput) : resultText,
          isError: update.status === "failed",
        });
      }
      break;
    }
    default:
      break;
  }
  return blockCounter;
};

export const convertMcpServersToAcp = (servers: Record<string, McpServerConfig>): AcpMcpServer[] =>
  Object.entries(servers).map(([serverName, config]) => ({
    name: serverName,
    command: config.command,
    ...(config.args ? { args: config.args } : {}),
    ...(config.env
      ? {
          env: Object.entries(config.env).map(([envName, envValue]) => ({
            name: envName,
            value: envValue,
          })),
        }
      : {}),
  }));
