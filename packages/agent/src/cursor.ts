import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
} from "@ai-sdk/provider";
import { Effect, Layer, Predicate, ServiceMap } from "effect";
import { convertPrompt } from "./convert-prompt.js";
import { CursorSpawnError } from "./errors.js";
import {
  EMPTY_USAGE,
  PROVIDER_ID,
  STOP_REASON,
  buildAgentStream,
  convertAssistantBlocks,
  convertToolResultBlocks,
  emitAssistantParts,
  emitToolResultParts,
  extractSessionId,
} from "./provider-shared.js";
import type { AgentProviderSettings, McpServerConfig } from "./types.js";

export interface CursorSettings extends AgentProviderSettings {
  model?: string;
  executable?: string;
}

const runGenerate = Effect.fn("CursorAgent.generate")(function* (
  options: LanguageModelV3CallOptions,
  settings: CursorSettings,
) {
  yield* Effect.annotateCurrentSpan({ model: settings.model ?? "cursor" });
  const { userPrompt } = convertPrompt(options.prompt);
  const content: LanguageModelV3Content[] = [];
  let sessionId: string | undefined;

  yield* Effect.tryPromise({
    try: async () => {
      for await (const event of spawnCursorAgent(userPrompt, settings, options.abortSignal)) {
        sessionId = extractSessionId(event) ?? sessionId;
        if (event.type === "assistant") content.push(...convertMessageBlocks(event));
        if (
          event.type === "thinking" &&
          event.subtype === "delta" &&
          typeof event.text === "string"
        ) {
          content.push({ type: "reasoning", text: event.text });
        }
      }
    },
    catch: (cause) =>
      new CursorSpawnError({
        executable: settings.executable ?? "cursor-agent",
        cause: String(cause),
      }),
  });

  return {
    content,
    finishReason: STOP_REASON,
    usage: EMPTY_USAGE,
    warnings: [],
    request: { body: userPrompt },
    response: {
      id: sessionId ?? crypto.randomUUID(),
      timestamp: new Date(),
      modelId: settings.model ?? "cursor",
    },
    providerMetadata: sessionId ? { [PROVIDER_ID]: { sessionId } } : undefined,
  };
});

const runStream = Effect.fn("CursorAgent.stream")(function* (
  options: LanguageModelV3CallOptions,
  settings: CursorSettings,
) {
  yield* Effect.annotateCurrentSpan({ model: settings.model ?? "cursor" });
  const { userPrompt } = convertPrompt(options.prompt);

  const stream = buildAgentStream(
    async (controller) => {
      let sessionId: string | undefined;
      let blockCounter = 0;

      controller.enqueue({ type: "stream-start", warnings: [] });

      for await (const event of spawnCursorAgent(userPrompt, settings, options.abortSignal)) {
        const eventSessionId = extractSessionId(event);
        if (eventSessionId) {
          if (!sessionId)
            controller.enqueue({
              type: "response-metadata",
              id: eventSessionId,
              timestamp: new Date(),
              modelId: settings.model ?? "cursor",
            });
          sessionId = eventSessionId;
        }

        if (
          event.type === "thinking" &&
          event.subtype === "delta" &&
          typeof event.text === "string"
        ) {
          const blockId = `block-${blockCounter++}`;
          controller.enqueue({ type: "reasoning-start", id: blockId });
          controller.enqueue({ type: "reasoning-delta", id: blockId, delta: event.text });
          controller.enqueue({ type: "reasoning-end", id: blockId });
        }

        if (event.type === "assistant") {
          const messageContent = extractMessageContent(event);
          if (messageContent) {
            blockCounter = emitAssistantParts(messageContent, controller, blockCounter);
            emitToolResultParts(messageContent, controller);
          }
        }
      }

      controller.enqueue({
        type: "finish",
        finishReason: STOP_REASON,
        usage: EMPTY_USAGE,
        providerMetadata: sessionId ? { [PROVIDER_ID]: { sessionId } } : undefined,
      });
    },
    (cause) =>
      new CursorSpawnError({
        executable: settings.executable ?? "cursor-agent",
        cause: String(cause),
      }),
  );

  return { stream, request: { body: userPrompt } };
});

const buildCursorAgent = (settings: CursorSettings) =>
  ({
    generate: (options: LanguageModelV3CallOptions) => runGenerate(options, settings),
    stream: (options: LanguageModelV3CallOptions) => runStream(options, settings),
  }) as const;

export class CursorAgent extends ServiceMap.Service<CursorAgent>()("@browser-tester/CursorAgent", {
  make: Effect.succeed(buildCursorAgent({})),
}) {
  static live = (settings: CursorSettings) =>
    Layer.succeed(CursorAgent)(buildCursorAgent(settings));
}

export const createCursorModel = (settings: CursorSettings = {}): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: PROVIDER_ID,
  modelId: "cursor",
  supportedUrls: {},
  doGenerate: (options) => Effect.runPromise(runGenerate(options, settings)),
  doStream: (options) => Effect.runPromise(runStream(options, settings)),
});

const extractMessageContent = (event: Record<string, unknown>): unknown[] | undefined => {
  const message = event.message;
  if (!Predicate.isReadonlyObject(message) || !Array.isArray(message.content)) return undefined;
  return message.content;
};

const convertMessageBlocks = (event: Record<string, unknown>): LanguageModelV3Content[] => {
  const content = extractMessageContent(event);
  if (!content) return [];
  return [...convertAssistantBlocks(content), ...convertToolResultBlocks(content)];
};

const createWorkspaceOverlay = (
  realWorkspace: string,
  mcpServers: Record<string, McpServerConfig>,
  executable: string,
): string => {
  const overlayDir = join(tmpdir(), `cursor-overlay-${crypto.randomUUID()}`);
  mkdirSync(overlayDir);

  for (const entry of readdirSync(realWorkspace)) {
    if (entry === ".cursor") continue;
    symlinkSync(join(realWorkspace, entry), join(overlayDir, entry));
  }

  const cursorDir = join(overlayDir, ".cursor");
  mkdirSync(cursorDir);
  writeFileSync(join(cursorDir, "mcp.json"), JSON.stringify({ mcpServers }, null, 2));

  for (const name of Object.keys(mcpServers)) {
    try {
      execFileSync(executable, ["mcp", "enable", name], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }

  return overlayDir;
};

const spawnCursorAgent = async function* (
  prompt: string,
  settings: CursorSettings,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  if (signal?.aborted) throw signal.reason;

  const realWorkspace = settings.cwd ?? process.cwd();
  const overlayDir = settings.mcpServers
    ? createWorkspaceOverlay(
        realWorkspace,
        settings.mcpServers,
        settings.executable ?? "cursor-agent",
      )
    : undefined;
  const workspace = overlayDir ?? realWorkspace;

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--trust",
    "--yolo",
    "--workspace",
    workspace,
  ];
  if (settings.model) args.push("--model", settings.model);
  if (settings.mcpServers) args.push("--approve-mcps");
  args.push(prompt);

  const executable = settings.executable ?? "cursor-agent";
  const child = spawn(executable, args, {
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, ...settings.env },
  });

  let spawnError: Error | undefined;
  child.on("error", (error) => {
    spawnError = error;
  });

  const onAbort = () => child.kill();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  try {
    let buffer = "";
    for await (const chunk of child.stdout) {
      if (spawnError) throw spawnError;
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
          yield JSON.parse(trimmed);
        } catch {
          continue;
        }
      }
    }
    if (spawnError) throw spawnError;
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim());
      } catch {
        /* ignore */
      }
    }
  } finally {
    if (!child.killed) child.kill();
    signal?.removeEventListener("abort", onAbort);
    if (overlayDir) rmSync(overlayDir, { recursive: true, force: true });
  }
};
