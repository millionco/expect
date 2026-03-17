import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { Effect, Layer, ServiceMap } from "effect";
import { convertPrompt } from "./convert-prompt.js";
import { ClaudeQueryError } from "./errors.js";
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
import { buildClaudeProcessEnv } from "./utils/build-claude-process-env.js";

const DEFAULT_CLAUDE_MAX_TURNS = 200;
const AGENT_LOG_DIRECTORY = join(tmpdir(), "browser-tester-agent-logs");

const createAgentDebugLogPath = (): string => {
  mkdirSync(AGENT_LOG_DIRECTORY, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(AGENT_LOG_DIRECTORY, `${timestamp}.log`);
};

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

const runGenerate = Effect.fn("ClaudeAgent.generate")(function* (
  options: LanguageModelV3CallOptions,
  settings: AgentProviderSettings,
) {
  const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
  const abortController = createLinkedAbortController(options.abortSignal);
  const content: LanguageModelV3Content[] = [];
  let sessionId: string | undefined;
  let finalResultText = "";

  yield* Effect.tryPromise({
    try: async () => {
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
    },
    catch: (cause) => new ClaudeQueryError({ cause }),
  });

  if (settings.permissionMode === "plan") {
    const allAssistantText = content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    const combinedText = [allAssistantText, finalResultText].filter(Boolean).join("\n");

    content.length = 0;
    content.push({ type: "text", text: combinedText });
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
});

const runStream = Effect.fn("ClaudeAgent.stream")(function* (
  options: LanguageModelV3CallOptions,
  settings: AgentProviderSettings,
) {
  const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
  const abortController = createLinkedAbortController(options.abortSignal);

  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start: (controller) => {
      let sessionId: string | undefined;
      let blockCounter = 0;

      return Effect.runPromise(
        Effect.tryPromise({
          try: async () => {
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
          },
          catch: (cause) => new ClaudeQueryError({ cause }),
        }).pipe(
          Effect.catchTag("ClaudeQueryError", (error) =>
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

const buildClaudeAgent = (settings: AgentProviderSettings) => ({
  generate: (options: LanguageModelV3CallOptions) => runGenerate(options, settings),
  stream: (options: LanguageModelV3CallOptions) => runStream(options, settings),
});

export class ClaudeAgent extends ServiceMap.Service<ClaudeAgent>()("@browser-tester/ClaudeAgent", {
  make: Effect.succeed(buildClaudeAgent({})),
}) {
  static live = (settings: AgentProviderSettings) =>
    Layer.succeed(ClaudeAgent)(buildClaudeAgent(settings));
}

export const createClaudeModel = (settings: AgentProviderSettings = {}): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: PROVIDER_ID,
  modelId: "claude",
  supportedUrls: {},
  doGenerate: (options) => Effect.runPromise(runGenerate(options, settings)),
  doStream: (options) => Effect.runPromise(runStream(options, settings)),
});

const buildQueryOptions = (
  settings: AgentProviderSettings,
  abortController: AbortController,
  systemPrompt: string,
) => {
  const resolvedModel = settings.model ?? "claude-opus-4-6";
  const supportsEffort = !resolvedModel.toLowerCase().includes("sonnet");
  const explicitExecutablePath = resolveClaudeExecutablePath();
  const env = buildClaudeProcessEnv(settings.env);
  const debugLogPath = settings.debugLogPath ?? createAgentDebugLogPath();

  return {
    model: resolvedModel,
    maxTurns: settings.maxTurns ?? DEFAULT_CLAUDE_MAX_TURNS,
    cwd: settings.cwd ?? process.cwd(),
    allowDangerouslySkipPermissions:
      settings.permissionMode === "bypassPermissions" ? true : undefined,
    permissionMode: settings.permissionMode ?? "bypassPermissions",
    abortController,
    debugFile: debugLogPath,
    ...(settings.effort && supportsEffort ? { effort: settings.effort } : {}),
    ...(systemPrompt ? { appendSystemPrompt: systemPrompt } : {}),
    ...(settings.sessionId ? { resume: settings.sessionId } : {}),
    env,
    ...(settings.mcpServers ? { mcpServers: settings.mcpServers } : {}),
    ...(explicitExecutablePath ? { pathToClaudeCodeExecutable: explicitExecutablePath } : {}),
  };
};
