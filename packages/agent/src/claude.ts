import * as fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
} from "@ai-sdk/provider";
import { ensureSafeCurrentWorkingDirectory } from "@browser-tester/utils";
import { Effect, Layer, ServiceMap } from "effect";
import { convertPrompt } from "./convert-prompt";
import { ClaudeQueryError } from "./errors";
import {
  EMPTY_USAGE,
  PROVIDER_ID,
  STOP_REASON,
  buildAgentStream,
  convertAssistantBlocks,
  convertToolResultBlocks,
  createLinkedAbortController,
  emitAssistantParts,
  emitToolResultParts,
  extractSessionId,
} from "./provider-shared";
import type { AgentProviderSettings } from "./types";
import { buildClaudeProcessEnv } from "./utils/build-claude-process-env";

const DEFAULT_CLAUDE_MAX_TURNS = 200;
const AGENT_TRACES_DIRECTORY_NAME = ".testie-agent-traces";

const createAgentDebugLogPath = (cwd?: string): string => {
  const baseDirectory = ensureSafeCurrentWorkingDirectory(cwd);
  const tracesDirectory = path.join(baseDirectory, AGENT_TRACES_DIRECTORY_NAME);
  fs.mkdirSync(tracesDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(tracesDirectory, `${timestamp}.log`);
};

const assertNoDebugLogErrors = (debugLogPath: string) => {
  let content: string;
  try {
    content = fs.readFileSync(debugLogPath, "utf-8");
  } catch {
    return;
  }
  const uniqueErrors = new Set<string>();
  for (const line of content.split("\n")) {
    if (line.includes("[ERROR]")) {
      uniqueErrors.add(line.replace(/^\S+\s+\[ERROR\]\s*/, ""));
    }
  }
  if (uniqueErrors.size > 0) {
    throw new Error([...uniqueErrors].join("\n"));
  }
};

const resolveClaudeExecutablePath = (): string | undefined => {
  const require = createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url);

  try {
    const sdkEntryPath = require.resolve("@anthropic-ai/claude-agent-sdk");
    const sdkCliPath = path.join(path.dirname(sdkEntryPath), "cli.js");
    return fs.existsSync(sdkCliPath) ? sdkCliPath : undefined;
  } catch {
    return undefined;
  }
};

const runGenerate = Effect.fn("ClaudeAgent.generate")(function* (
  options: LanguageModelV3CallOptions,
  settings: AgentProviderSettings,
) {
  yield* Effect.annotateCurrentSpan({ model: settings.model ?? "claude-opus-4-6" });
  const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
  const abortController = createLinkedAbortController(options.abortSignal);
  const content: LanguageModelV3Content[] = [];
  let sessionId: string | undefined;
  let finalResultText = "";

  yield* Effect.tryPromise({
    try: async () => {
      const query = await loadClaudeQuery(settings.cwd);
      const queryOptions = buildQueryOptions(settings, abortController, systemPrompt);
      for await (const event of query({
        prompt: userPrompt,
        options: queryOptions,
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
      assertNoDebugLogErrors(queryOptions.debugFile);
    },
    catch: (cause) => new ClaudeQueryError({ cause: String(cause) }),
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
  yield* Effect.annotateCurrentSpan({ model: settings.model ?? "claude-opus-4-6" });
  const { userPrompt, systemPrompt } = convertPrompt(options.prompt);
  const abortController = createLinkedAbortController(options.abortSignal);

  const stream = buildAgentStream(
    async (controller) => {
      const query = await loadClaudeQuery(settings.cwd);
      const queryOptions = buildQueryOptions(settings, abortController, systemPrompt);
      let sessionId: string | undefined;
      let blockCounter = 0;

      controller.enqueue({ type: "stream-start", warnings: [] });

      for await (const event of query({
        prompt: userPrompt,
        options: queryOptions,
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

      assertNoDebugLogErrors(queryOptions.debugFile);

      controller.enqueue({
        type: "finish",
        finishReason: STOP_REASON,
        usage: EMPTY_USAGE,
        providerMetadata: sessionId ? { [PROVIDER_ID]: { sessionId } } : undefined,
      });
    },
    (cause) => new ClaudeQueryError({ cause: String(cause) }),
  );

  return { stream, request: { body: userPrompt } };
});

const buildClaudeAgent = (settings: AgentProviderSettings) =>
  ({
    generate: (options: LanguageModelV3CallOptions) => runGenerate(options, settings),
    stream: (options: LanguageModelV3CallOptions) => runStream(options, settings),
  }) as const;

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
  const resolvedPermissionMode = settings.permissionMode ?? "bypassPermissions";
  const supportsEffort = !resolvedModel.toLowerCase().includes("sonnet");
  const explicitExecutablePath = resolveClaudeExecutablePath();
  const env = buildClaudeProcessEnv(settings.env);
  const debugLogPath = settings.debugLogPath ?? createAgentDebugLogPath(settings.cwd);

  return {
    model: resolvedModel,
    maxTurns: settings.maxTurns ?? DEFAULT_CLAUDE_MAX_TURNS,
    cwd: ensureSafeCurrentWorkingDirectory(settings.cwd),
    allowDangerouslySkipPermissions:
      resolvedPermissionMode === "bypassPermissions" ? true : undefined,
    permissionMode: resolvedPermissionMode,
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

const loadClaudeQuery = async (preferredDirectory?: string) => {
  ensureSafeCurrentWorkingDirectory(preferredDirectory);
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  return query;
};
