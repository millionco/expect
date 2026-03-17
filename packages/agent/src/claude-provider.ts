import * as fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import { ClaudeQueryError } from "./errors.js";
import { ClaudeStreamEvent } from "./schemas/claude-stream.js";
import { AgentStreamOptions } from "./types.js";
import { buildClaudeProcessEnv } from "./utils/build-claude-process-env.js";

const AGENT_TRACES_DIRECTORY_NAME = ".testie-agent-traces";

const createAgentDebugLogPath = (cwd: string): string => {
  const tracesDirectory = path.join(cwd, AGENT_TRACES_DIRECTORY_NAME);
  fs.mkdirSync(tracesDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(tracesDirectory, `${timestamp}.log`);
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

const buildQueryOptions = (options: AgentStreamOptions) => {
  const explicitExecutablePath = resolveClaudeExecutablePath();
  const env = buildClaudeProcessEnv();
  const debugLogPath = createAgentDebugLogPath(options.cwd);

  return {
    model: options.model,
    cwd: options.cwd,
    allowDangerouslySkipPermissions: true,
    permissionMode: "bypassPermissions" as const,
    debugFile: debugLogPath,
    ...(Option.isSome(options.sessionId) ? { resume: options.sessionId.value } : {}),
    ...(Option.isSome(options.systemPrompt) ? { appendSystemPrompt: options.systemPrompt.value } : {}),
    env,
    ...(explicitExecutablePath ? { pathToClaudeCodeExecutable: explicitExecutablePath } : {}),
  };
};

export class ClaudeProvider extends ServiceMap.Service<
  ClaudeProvider,
  {
    readonly stream: (
      options: AgentStreamOptions,
    ) => Stream.Stream<LanguageModelV3StreamPart, ClaudeQueryError>;
  }
>()("@browser-tester/ClaudeProvider") {
  static layer = Layer.succeed(
    ClaudeProvider,
    ClaudeProvider.of({
      stream: (options) => {
        const claudeQuery = query({
          prompt: options.prompt,
          options: buildQueryOptions(options),
        });

        return Stream.fromAsyncIterable(
          claudeQuery,
          (cause) => new ClaudeQueryError({ cause: String(cause) }),
        ).pipe(
          Stream.mapEffect((rawEvent) => Schema.decodeUnknownEffect(ClaudeStreamEvent)(rawEvent)),
          Stream.map((event) => event.streamParts),
          Stream.filter(Option.isSome),
          Stream.flatMap((option) => Stream.fromIterable(option.value)),
          Stream.ensuring(Effect.sync(() => claudeQuery.close())),
        );
      },
    }),
  );
}
