import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Struct } from "effect";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
} from "@ai-sdk/provider";
import { convertPrompt } from "./convert-prompt.js";
import {
  EMPTY_USAGE,
  PROVIDER_ID,
  STOP_REASON,
  convertAssistantBlocks,
  convertToolResultBlocks,
  createLinkedAbortController,
  emitAssistantParts,
  emitToolResultParts,
  extractSessionId,
} from "./provider-shared.js";
import type { AgentProviderSettings } from "./types.js";

const DEFAULT_CLAUDE_MAX_TURNS = 200;

const resolveClaudeExecutablePath = (): string | undefined => {
  const require = createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url);

  try {
    const sdkEntryPath = require.resolve("@anthropic-ai/claude-agent-sdk");
    const sdkCliPath = join(dirname(sdkEntryPath), "cli.js");
    return existsSync(sdkCliPath) ? sdkCliPath : undefined;
  } catch {
    return undefined;
  }
};

export const createClaudeModel = (settings: AgentProviderSettings = {}): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: PROVIDER_ID,
  modelId: "claude",
  supportedUrls: {},

  async doGenerate(options: LanguageModelV3CallOptions) {
    const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
    const abortController = createLinkedAbortController(options.abortSignal);
    const content: LanguageModelV3Content[] = [];
    let sessionId: string | undefined;
    let finalResultText = "";

    for await (const event of query({
      prompt: userPrompt,
      options: buildQueryOptions(settings, abortController, systemPrompt),
    })) {
      sessionId = extractSessionId(event) ?? sessionId;
      if (event.type === "assistant")
        content.push(...convertAssistantBlocks(event.message.content));
      if (event.type === "user" && Array.isArray(event.message.content))
        content.push(...convertToolResultBlocks(event.message.content));
      if (event.type === "result" && "result" in event && typeof event.result === "string") {
        finalResultText = event.result;
      }
    }

    if (settings.permissionMode === "plan" && finalResultText) {
      content.length = 0;
      content.push({ type: "text", text: finalResultText });
    }

    return {
      content,
      finishReason: STOP_REASON,
      usage: EMPTY_USAGE,
      warnings: [],
      request: { body: userPrompt },
      response: {
        id: sessionId ?? crypto.randomUUID(),
        timestamp: new Date(),
        modelId: settings.model ?? "claude-opus-4-6",
      },
      providerMetadata: sessionId ? { [PROVIDER_ID]: { sessionId } } : undefined,
    };
  },

  async doStream(options: LanguageModelV3CallOptions) {
    const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
    const abortController = createLinkedAbortController(options.abortSignal);
    let sessionId: string | undefined;
    let blockCounter = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue({ type: "stream-start", warnings: [] });

          for await (const event of query({
            prompt: userPrompt,
            options: buildQueryOptions(settings, abortController, systemPrompt),
          })) {
            const eventSessionId = extractSessionId(event);
            if (eventSessionId) {
              if (!sessionId)
                controller.enqueue({
                  type: "response-metadata",
                  id: eventSessionId,
                  timestamp: new Date(),
                  modelId: settings.model ?? "claude-opus-4-6",
                });
              sessionId = eventSessionId;
            }

            if (event.type === "assistant")
              blockCounter = emitAssistantParts(event.message.content, controller, blockCounter);
            if (event.type === "user" && Array.isArray(event.message.content))
              emitToolResultParts(event.message.content, controller);
          }

          controller.enqueue({
            type: "finish",
            finishReason: STOP_REASON,
            usage: EMPTY_USAGE,
            providerMetadata: sessionId ? { [PROVIDER_ID]: { sessionId } } : undefined,
          });
        } catch (error) {
          controller.enqueue({ type: "error", error });
        } finally {
          controller.close();
        }
      },
    });

    return { stream, request: { body: userPrompt } };
  },
});

const buildQueryOptions = (
  settings: AgentProviderSettings,
  abortController: AbortController,
  systemPrompt: string,
) => {
  const resolvedModel = settings.model ?? "claude-opus-4-6";
  const supportsEffort = !resolvedModel.toLowerCase().includes("sonnet");
  const explicitExecutablePath = resolveClaudeExecutablePath();
  const queryOptions = {
    model: resolvedModel,
    maxTurns: settings.maxTurns ?? DEFAULT_CLAUDE_MAX_TURNS,
    cwd: settings.cwd ?? process.cwd(),
    allowDangerouslySkipPermissions:
      settings.permissionMode === "bypassPermissions" ? true : undefined,
    permissionMode: settings.permissionMode ?? "bypassPermissions",
    abortController,
    /** @note(rasmus): strip CLAUDECODE so the subprocess doesn't think it's nested inside another coding agent */
    ...(settings.env ? { env: Struct.omit(settings.env, "CLAUDECODE") } : {}),
    ...(settings.effort && supportsEffort ? { effort: settings.effort } : {}),
    ...(systemPrompt ? { appendSystemPrompt: systemPrompt } : {}),
    ...(settings.sessionId ? { resume: settings.sessionId } : {}),
    ...(settings.mcpServers ? { mcpServers: settings.mcpServers } : {}),
    ...(explicitExecutablePath ? { pathToClaudeCodeExecutable: explicitExecutablePath } : {}),
    ...(settings.tools !== undefined ? { tools: settings.tools } : {}),
  };

  return queryOptions;
};
