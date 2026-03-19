import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { Effect, Predicate, Schema } from "effect";
import { convertPrompt } from "../convert-prompt";
import { buildAgentStream } from "../provider-shared";
import type { AgentProviderSettings } from "../types";
import { AcpInitializeError, AcpPromptError, AcpSessionError, AcpTransportError } from "./errors";
import {
  ACP_CLIENT_NAME,
  ACP_CLIENT_VERSION,
  ACP_DEFAULT_PERMISSION_OPTION_ID,
  ACP_JSONRPC_VERSION,
  ACP_PROTOCOL_VERSION,
} from "./constants";
import {
  adaptUpdatesToContent,
  convertMcpServersToAcp,
  emitUpdateStreamParts,
  mapStopReason,
} from "./adapter";
import {
  type ContentBlock,
  InitializeResponse,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionParams,
  SessionUpdateNotification,
  type AcpMcpServer,
  type SessionUpdate,
} from "./schemas";

const PROVIDER_ID = "browser-tester-agent";

const EMPTY_USAGE = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

export interface AcpModelSettings extends AgentProviderSettings {
  command?: string;
  commandArgs?: string[];
}

const createRequestIdCounter = (): (() => number) => {
  let counter = 0;
  return () => ++counter;
};

const createJsonRpcRequest = (nextRequestId: () => number, method: string, params: unknown) => ({
  jsonrpc: ACP_JSONRPC_VERSION,
  id: nextRequestId(),
  method,
  params,
});

const createJsonRpcResponse = (requestId: number, result: unknown) => ({
  jsonrpc: ACP_JSONRPC_VERSION,
  id: requestId,
  result,
});

const writeJsonRpc = (childProcess: ChildProcess, message: object) => {
  childProcess.stdin?.write(JSON.stringify(message) + "\n");
};

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcResponseMessage extends JsonRpcMessage {
  id: number;
}

interface JsonRpcRequestMessage extends JsonRpcMessage {
  id: number;
  method: string;
}

const isJsonRpcResponse = (message: JsonRpcMessage): message is JsonRpcResponseMessage =>
  message.id !== undefined && (message.result !== undefined || message.error !== undefined);

const isJsonRpcNotification = (message: JsonRpcMessage): boolean =>
  message.method !== undefined && message.id === undefined;

const isJsonRpcRequest = (message: JsonRpcMessage): message is JsonRpcRequestMessage =>
  message.method !== undefined && message.id !== undefined;

const readNextMessage = async (
  messages: AsyncGenerator<JsonRpcMessage>,
): Promise<JsonRpcMessage | undefined> => {
  const { value, done } = await messages.next();
  return done ? undefined : value;
};

const awaitResponse = async (
  messages: AsyncGenerator<JsonRpcMessage>,
  expectedId: number,
  signal?: AbortSignal,
): Promise<JsonRpcResponseMessage> => {
  while (true) {
    if (signal?.aborted) {
      throw new AcpTransportError({ cause: "Request aborted" });
    }
    const message = await readNextMessage(messages);
    if (!message) {
      throw new AcpTransportError({ cause: "Connection closed before response received" });
    }
    if (isJsonRpcResponse(message) && message.id === expectedId) return message;
  }
};

async function* readNdjsonMessages(
  childProcess: ChildProcess,
  signal?: AbortSignal,
): AsyncGenerator<JsonRpcMessage> {
  if (!childProcess.stdout) return;

  let buffer = "";
  for await (const chunk of childProcess.stdout) {
    if (signal?.aborted) return;
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcMessage;
        if (Predicate.isObject(parsed)) yield parsed;
      } catch {
        // HACK: partial NDJSON lines from agent may be malformed — skip
        continue;
      }
    }
  }
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim()) as JsonRpcMessage;
      if (Predicate.isObject(parsed)) yield parsed;
    } catch {
      // HACK: trailing NDJSON buffer may be incomplete — skip
    }
  }
}

const resolveCommand = (settings: AcpModelSettings): string => {
  if (!settings.command) {
    throw new AcpTransportError({
      cause: "ACP model requires a 'command' field to spawn the agent process",
    });
  }
  return settings.command;
};

const resolveMcpServers = (settings: AcpModelSettings): AcpMcpServer[] => {
  if (!settings.mcpServers) return [];
  return convertMcpServersToAcp(settings.mcpServers);
};

const spawnAcpAgent = (settings: AcpModelSettings, command: string): ChildProcess =>
  spawn(command, settings.commandArgs ?? [], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, ...settings.env },
    cwd: settings.cwd,
  });

interface AcpConnection {
  readonly agentProcess: ChildProcess;
  readonly messages: AsyncGenerator<JsonRpcMessage>;
  readonly sessionId: string;
  readonly nextRequestId: () => number;
}

const withAcpAgent = async <T>(
  settings: AcpModelSettings,
  command: string,
  abortSignal: AbortSignal | undefined,
  body: (connection: AcpConnection) => Promise<T>,
): Promise<T> => {
  const agentProcess = spawnAcpAgent(settings, command);
  const onAbort = () => agentProcess.kill();
  abortSignal?.addEventListener("abort", onAbort, { once: true });
  const nextRequestId = createRequestIdCounter();

  try {
    const messages = readNdjsonMessages(agentProcess, abortSignal);
    await initializeConnection(agentProcess, messages, nextRequestId, abortSignal);
    const mcpServers = resolveMcpServers(settings);

    const sessionId = settings.sessionId
      ? await loadSession(
          agentProcess,
          messages,
          settings.sessionId,
          settings,
          mcpServers,
          nextRequestId,
          abortSignal,
        )
      : (
          await createSession(
            agentProcess,
            messages,
            settings,
            mcpServers,
            nextRequestId,
            abortSignal,
          )
        ).sessionId;

    return await body({ agentProcess, messages, sessionId, nextRequestId });
  } finally {
    abortSignal?.removeEventListener("abort", onAbort);
    agentProcess.kill();
  }
};

const initializeConnection = async (
  agentProcess: ChildProcess,
  messages: AsyncGenerator<JsonRpcMessage>,
  nextRequestId: () => number,
  signal?: AbortSignal,
) => {
  const initRequest = createJsonRpcRequest(nextRequestId, "initialize", {
    protocolVersion: ACP_PROTOCOL_VERSION,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    clientInfo: { name: ACP_CLIENT_NAME, version: ACP_CLIENT_VERSION },
  });
  writeJsonRpc(agentProcess, initRequest);

  const response = await awaitResponse(messages, initRequest.id, signal);
  if (response.error) {
    throw new AcpInitializeError({
      cause: `Agent returned error: ${response.error.message} (code: ${response.error.code})`,
    });
  }
  try {
    return Schema.decodeUnknownSync(InitializeResponse)(response.result);
  } catch (parseError) {
    throw new AcpInitializeError({
      cause: `Malformed initialize response: ${String(parseError)}`,
    });
  }
};

const createSession = async (
  agentProcess: ChildProcess,
  messages: AsyncGenerator<JsonRpcMessage>,
  settings: AcpModelSettings,
  mcpServers: AcpMcpServer[],
  nextRequestId: () => number,
  signal?: AbortSignal,
) => {
  const sessionRequest = createJsonRpcRequest(nextRequestId, "session/new", {
    cwd: settings.cwd,
    mcpServers,
  });
  writeJsonRpc(agentProcess, sessionRequest);

  const response = await awaitResponse(messages, sessionRequest.id, signal);
  if (response.error) {
    throw new AcpSessionError({
      cause: `Session creation failed: ${response.error.message} (code: ${response.error.code})`,
    });
  }
  try {
    return Schema.decodeUnknownSync(NewSessionResponse)(response.result);
  } catch (parseError) {
    throw new AcpSessionError({
      cause: `Malformed session response: ${String(parseError)}`,
    });
  }
};

const loadSession = async (
  agentProcess: ChildProcess,
  messages: AsyncGenerator<JsonRpcMessage>,
  sessionId: string,
  settings: AcpModelSettings,
  mcpServers: AcpMcpServer[],
  nextRequestId: () => number,
  signal?: AbortSignal,
) => {
  const loadRequest = createJsonRpcRequest(nextRequestId, "session/load", {
    sessionId,
    cwd: settings.cwd,
    mcpServers,
  });
  writeJsonRpc(agentProcess, loadRequest);

  while (true) {
    if (signal?.aborted) {
      throw new AcpTransportError({ cause: "Request aborted during session load" });
    }
    const message = await readNextMessage(messages);
    if (!message) {
      throw new AcpSessionError({
        cause: "Agent closed connection before responding to session/load",
      });
    }
    if (isJsonRpcNotification(message) && message.method === "session/update") continue;
    if (isJsonRpcResponse(message) && message.id === loadRequest.id) {
      if (message.error) {
        throw new AcpSessionError({
          cause: `Session load failed: ${message.error.message} (code: ${message.error.code})`,
        });
      }
      return sessionId;
    }
  }
};

const handlePermissionRequest = (
  agentProcess: ChildProcess,
  requestId: number,
  params: unknown,
) => {
  let selectedOptionId = ACP_DEFAULT_PERMISSION_OPTION_ID;
  try {
    const decoded = Schema.decodeUnknownSync(RequestPermissionParams)(params);
    if (decoded.options.length > 0) {
      selectedOptionId = decoded.options[0].optionId;
    }
  } catch {
    // HACK: fall back to default permission if params don't match schema
  }
  writeJsonRpc(
    agentProcess,
    createJsonRpcResponse(requestId, {
      outcome: { outcome: "selected", optionId: selectedOptionId },
    }),
  );
};

interface PromptResult {
  updates: SessionUpdate[];
  stopReason: typeof PromptResponse.Type.stopReason;
}

const sendPrompt = async (
  agentProcess: ChildProcess,
  messages: AsyncGenerator<JsonRpcMessage>,
  nextRequestId: () => number,
  sessionId: string,
  prompt: ContentBlock[],
  signal?: AbortSignal,
): Promise<PromptResult> => {
  const promptRequest = createJsonRpcRequest(nextRequestId, "session/prompt", {
    sessionId,
    prompt,
  });
  writeJsonRpc(agentProcess, promptRequest);

  const updates: SessionUpdate[] = [];

  while (true) {
    if (signal?.aborted) {
      throw new AcpTransportError({ cause: "Request aborted during prompt" });
    }
    const message = await readNextMessage(messages);
    if (!message) {
      throw new AcpPromptError({
        cause: "Agent closed connection before responding to session/prompt",
      });
    }

    if (isJsonRpcNotification(message) && message.method === "session/update") {
      try {
        const notification = Schema.decodeUnknownSync(SessionUpdateNotification)(message.params);
        updates.push(notification.update);
      } catch {
        // HACK: some updates may not match our schema — skip gracefully
      }
      continue;
    }

    if (isJsonRpcRequest(message) && message.method === "session/request_permission") {
      handlePermissionRequest(agentProcess, message.id, message.params);
      continue;
    }

    if (isJsonRpcResponse(message) && message.id === promptRequest.id) {
      if (message.error) {
        throw new AcpPromptError({
          cause: `Prompt failed: ${message.error.message} (code: ${message.error.code})`,
        });
      }
      try {
        const response = Schema.decodeUnknownSync(PromptResponse)(message.result);
        return { updates, stopReason: response.stopReason };
      } catch (parseError) {
        throw new AcpPromptError({
          cause: `Malformed prompt response: ${String(parseError)}`,
        });
      }
    }
  }
};

const runGenerate = Effect.fn("AcpClient.generate")(function* (
  callOptions: LanguageModelV3CallOptions,
  settings: AcpModelSettings,
  command: string,
) {
  yield* Effect.annotateCurrentSpan({ command });
  const { userPrompt } = convertPrompt(callOptions.prompt);

  const result = yield* Effect.tryPromise({
    try: () =>
      withAcpAgent(settings, command, callOptions.abortSignal, async (connection) => {
        const prompt: ContentBlock[] = [{ type: "text", text: userPrompt }];
        return await sendPrompt(
          connection.agentProcess,
          connection.messages,
          connection.nextRequestId,
          connection.sessionId,
          prompt,
          callOptions.abortSignal,
        );
      }),
    catch: (cause) => {
      if (cause instanceof AcpInitializeError) return cause;
      if (cause instanceof AcpSessionError) return cause;
      if (cause instanceof AcpPromptError) return cause;
      if (cause instanceof AcpTransportError) return cause;
      return new AcpTransportError({ cause: String(cause) });
    },
  });

  const content = adaptUpdatesToContent(result.updates);

  return {
    content,
    finishReason: mapStopReason(result.stopReason),
    usage: EMPTY_USAGE,
    warnings: [],
    request: { body: userPrompt },
    response: {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      modelId: command,
    },
    providerMetadata: undefined,
  };
});

const runStream = Effect.fn("AcpClient.stream")(function* (
  callOptions: LanguageModelV3CallOptions,
  settings: AcpModelSettings,
  command: string,
) {
  yield* Effect.annotateCurrentSpan({ command });
  const { userPrompt } = convertPrompt(callOptions.prompt);

  const stream = buildAgentStream(
    async (controller) => {
      await withAcpAgent(settings, command, callOptions.abortSignal, async (connection) => {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({
          type: "response-metadata",
          id: connection.sessionId,
          timestamp: new Date(),
          modelId: command,
        });

        const promptRequest = createJsonRpcRequest(connection.nextRequestId, "session/prompt", {
          sessionId: connection.sessionId,
          prompt: [{ type: "text", text: userPrompt }],
        });
        writeJsonRpc(connection.agentProcess, promptRequest);

        let blockCounter = 0;

        while (true) {
          if (callOptions.abortSignal?.aborted) break;
          const message = await readNextMessage(connection.messages);
          if (!message) break;

          if (isJsonRpcNotification(message) && message.method === "session/update") {
            try {
              const notification = Schema.decodeUnknownSync(SessionUpdateNotification)(
                message.params,
              );
              blockCounter = emitUpdateStreamParts(notification.update, controller, blockCounter);
            } catch {
              // HACK: some updates may not match our schema — skip gracefully
            }
            continue;
          }

          if (isJsonRpcRequest(message) && message.method === "session/request_permission") {
            handlePermissionRequest(connection.agentProcess, message.id, message.params);
            continue;
          }

          if (isJsonRpcResponse(message) && message.id === promptRequest.id) {
            if (message.error) {
              throw new AcpPromptError({
                cause: `${message.error.message} (code: ${message.error.code})`,
              });
            }
            try {
              const response = Schema.decodeUnknownSync(PromptResponse)(message.result);
              controller.enqueue({
                type: "finish",
                finishReason: mapStopReason(response.stopReason),
                usage: EMPTY_USAGE,
                providerMetadata: undefined,
              });
            } catch (parseError) {
              throw new AcpPromptError({
                cause: `Malformed prompt response: ${String(parseError)}`,
              });
            }
            break;
          }
        }
      });
    },
    (cause) => {
      if (cause instanceof AcpTransportError) return cause;
      if (cause instanceof AcpInitializeError) return cause;
      if (cause instanceof AcpSessionError) return cause;
      if (cause instanceof AcpPromptError) return cause;
      return new AcpTransportError({ cause: String(cause) });
    },
  );

  return { stream, request: { body: userPrompt } };
});

export const createAcpModel = (settings: AcpModelSettings): LanguageModelV3 => {
  const command = resolveCommand(settings);
  return {
    specificationVersion: "v3",
    provider: PROVIDER_ID,
    modelId: `acp:${command}`,
    supportedUrls: {},
    doGenerate: (modelCallOptions) =>
      Effect.runPromise(runGenerate(modelCallOptions, settings, command)),
    doStream: (modelCallOptions) =>
      Effect.runPromise(runStream(modelCallOptions, settings, command)),
  };
};
