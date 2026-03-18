import type { LanguageModelV3Content, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Predicate } from "effect";
import { serializeToolResult } from "./utils/serialize-tool-result";

export const PROVIDER_ID = "browser-tester-agent";

export const EMPTY_USAGE = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

export const STOP_REASON = { unified: "stop" as const, raw: undefined };

export const createLinkedAbortController = (signal?: AbortSignal): AbortController => {
  const controller = new AbortController();
  if (signal) signal.addEventListener("abort", () => controller.abort(signal.reason));
  return controller;
};

export const extractSessionId = (event: Record<string, unknown>): string | undefined =>
  typeof event.session_id === "string" ? event.session_id : undefined;

const stringField = (
  record: Readonly<Record<PropertyKey, unknown>>,
  key: string,
  fallback: string,
): string => {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
};

export const convertAssistantBlocks = (content: unknown[]): LanguageModelV3Content[] =>
  content.filter(Predicate.isReadonlyObject).flatMap((block): LanguageModelV3Content[] => {
    if (block.type === "text" && typeof block.text === "string")
      return [{ type: "text", text: block.text }];
    if (block.type === "thinking" && typeof block.thinking === "string")
      return [{ type: "reasoning", text: block.thinking }];
    if (block.type === "tool_use") {
      return [
        {
          type: "tool-call",
          toolCallId: stringField(block, "id", `tool_${Date.now()}`),
          toolName: stringField(block, "name", "unknown"),
          input: JSON.stringify(block.input ?? {}),
          providerExecuted: true,
        },
      ];
    }
    return [];
  });

export const convertToolResultBlocks = (content: unknown[]): LanguageModelV3Content[] =>
  content
    .filter(Predicate.isReadonlyObject)
    .filter((block) => block.type === "tool_result" || block.type === "tool_error")
    .map((block) => ({
      type: "tool-result" as const,
      toolCallId: stringField(block, "tool_use_id", "unknown"),
      toolName: stringField(block, "name", "unknown"),
      result:
        block.type === "tool_error"
          ? serializeToolResult(block.error)
          : serializeToolResult(block.content),
      isError: block.type === "tool_error" || block.is_error === true,
    }));

export const emitAssistantParts = (
  content: unknown[],
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
  blockCounter: number,
): number => {
  for (const block of content) {
    if (!Predicate.isReadonlyObject(block)) continue;
    const blockId = `block-${blockCounter++}`;

    if (block.type === "text" && typeof block.text === "string") {
      controller.enqueue({ type: "text-start", id: blockId });
      controller.enqueue({ type: "text-delta", id: blockId, delta: block.text });
      controller.enqueue({ type: "text-end", id: blockId });
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      controller.enqueue({ type: "reasoning-start", id: blockId });
      controller.enqueue({ type: "reasoning-delta", id: blockId, delta: block.thinking });
      controller.enqueue({ type: "reasoning-end", id: blockId });
    } else if (block.type === "tool_use") {
      const toolCallId = stringField(block, "id", `tool_${blockCounter}`);
      const toolName = stringField(block, "name", "unknown");
      const inputStr = JSON.stringify(block.input ?? {});
      controller.enqueue({
        type: "tool-input-start",
        id: toolCallId,
        toolName,
        providerExecuted: true,
      });
      controller.enqueue({ type: "tool-input-delta", id: toolCallId, delta: inputStr });
      controller.enqueue({ type: "tool-input-end", id: toolCallId });
      controller.enqueue({
        type: "tool-call",
        toolCallId,
        toolName,
        input: inputStr,
        providerExecuted: true,
      });
    }
  }
  return blockCounter;
};

export const emitToolResultParts = (
  content: unknown[],
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
): void => {
  for (const block of content) {
    if (!Predicate.isReadonlyObject(block)) continue;
    if (block.type !== "tool_result" && block.type !== "tool_error") continue;
    controller.enqueue({
      type: "tool-result",
      toolCallId: stringField(block, "tool_use_id", "unknown"),
      toolName: stringField(block, "name", "unknown"),
      result:
        block.type === "tool_error"
          ? serializeToolResult(block.error)
          : serializeToolResult(block.content),
      isError: block.type === "tool_error" || block.is_error === true,
    });
  }
};

export const buildAgentStream = (
  execute: (
    controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
  ) => Promise<void>,
  toError: (cause: unknown) => { readonly _tag: string },
): ReadableStream<LanguageModelV3StreamPart> =>
  new ReadableStream<LanguageModelV3StreamPart>({
    start: (controller) =>
      Effect.runPromise(
        Effect.tryPromise({
          try: () => execute(controller),
          catch: (cause) => toError(cause),
        }).pipe(
          // HACK: catchCause needed to forward defects as stream error events — catchTag cannot catch defects
          Effect.catchCause((cause) =>
            Effect.sync(() => controller.enqueue({ type: "error", error: cause })),
          ),
        ),
      ).finally(() => controller.close()),
  });
