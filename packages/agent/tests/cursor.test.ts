import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";

let pendingEvents: Record<string, unknown>[] = [];

vi.mock("node:child_process", () => ({
  spawn: () => {
    const ndjson = pendingEvents.map((event) => JSON.stringify(event)).join("\n") + "\n";
    const stdout = Readable.from([ndjson]);
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      stdout,
      stdin: null,
      stderr: null,
      pid: 1234,
      killed: false,
      kill: vi.fn(),
      ref: vi.fn(),
      unref: vi.fn(),
      connected: false,
      disconnect: vi.fn(),
      send: vi.fn(),
      exitCode: 0,
      signalCode: null,
      spawnargs: [],
      spawnfile: "cursor-agent",
      [Symbol.dispose]: vi.fn(),
    });
  },
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    symlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import { createCursorModel } from "../src/cursor";

const defaultOptions: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
};

const generateWith = (events: Record<string, unknown>[]) => {
  pendingEvents = events;
  return createCursorModel().doGenerate(defaultOptions);
};

const streamWith = async (
  events: Record<string, unknown>[],
): Promise<LanguageModelV3StreamPart[]> => {
  pendingEvents = events;
  const { stream } = await createCursorModel().doStream(defaultOptions);
  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
};

const sdkSystem = { type: "system", subtype: "init", session_id: "sess-cursor" };

const sdkAssistant = (content: Record<string, unknown>[]) => ({
  type: "assistant",
  session_id: "sess-cursor",
  message: { id: "msg_test", role: "assistant", content },
});

const sdkThinking = (text: string) => ({
  type: "thinking",
  subtype: "delta",
  text,
  session_id: "sess-cursor",
});

const mcpToolCallStarted = (
  toolCallId: string,
  providerIdentifier: string,
  toolName: string,
  args: Record<string, unknown>,
) => ({
  type: "tool_call",
  subtype: "started",
  call_id: toolCallId,
  tool_call: {
    mcpToolCall: {
      args: {
        name: `${providerIdentifier}-${toolName}`,
        args,
        toolCallId,
        providerIdentifier,
        toolName,
      },
    },
  },
  session_id: "sess-cursor",
});

const mcpToolCallCompleted = (
  toolCallId: string,
  providerIdentifier: string,
  toolName: string,
  args: Record<string, unknown>,
  resultText: string,
  isError = false,
) => ({
  type: "tool_call",
  subtype: "completed",
  call_id: toolCallId,
  tool_call: {
    mcpToolCall: {
      args: {
        name: `${providerIdentifier}-${toolName}`,
        args,
        toolCallId,
        providerIdentifier,
        toolName,
      },
      result: {
        success: {
          content: [{ text: { text: resultText } }],
          isError,
        },
      },
    },
  },
  session_id: "sess-cursor",
});

const readToolCallStarted = (toolCallId: string, filePath: string) => ({
  type: "tool_call",
  subtype: "started",
  call_id: toolCallId,
  tool_call: { readToolCall: { args: { path: filePath } } },
  session_id: "sess-cursor",
});

const readToolCallCompleted = (toolCallId: string, filePath: string) => ({
  type: "tool_call",
  subtype: "completed",
  call_id: toolCallId,
  tool_call: {
    readToolCall: {
      args: { path: filePath },
      result: { success: { content: "file contents" } },
    },
  },
  session_id: "sess-cursor",
});

describe("createCursorModel", () => {
  describe("doGenerate", () => {
    it("converts text block", async () => {
      const { content } = await generateWith([sdkAssistant([{ type: "text", text: "Hello" }])]);
      expect(content).toEqual([{ type: "text", text: "Hello" }]);
    });

    it("converts thinking to reasoning", async () => {
      const { content } = await generateWith([sdkThinking("analyzing...")]);
      expect(content).toEqual([{ type: "reasoning", text: "analyzing..." }]);
    });

    it("converts tool_use in assistant message to tool-call with providerExecuted", async () => {
      const { content } = await generateWith([
        sdkAssistant([
          {
            type: "tool_use",
            id: "toolu_abc",
            name: "browser_open",
            input: { url: "http://localhost" },
          },
        ]),
      ]);
      expect(content[0]).toMatchObject({
        type: "tool-call",
        toolCallId: "toolu_abc",
        toolName: "browser_open",
        providerExecuted: true,
      });
    });

    it("exposes sessionId in providerMetadata", async () => {
      const result = await generateWith([sdkSystem]);
      expect(result.providerMetadata?.["browser-tester-agent"]).toEqual({
        sessionId: "sess-cursor",
      });
    });

    it("returns stop finishReason", async () => {
      const result = await generateWith([sdkAssistant([{ type: "text", text: "Hi" }])]);
      expect(result.finishReason.unified).toBe("stop");
    });

    it("handles mixed thinking and text content", async () => {
      const { content } = await generateWith([
        sdkThinking("hmm"),
        sdkAssistant([{ type: "text", text: "ok" }]),
      ]);
      expect(content.map((part: LanguageModelV3Content) => part.type)).toEqual([
        "reasoning",
        "text",
      ]);
    });

    it("throws CursorNotSignedInError when cursor-agent produces no output", async () => {
      await expect(generateWith([])).rejects.toThrow("you may not be signed in to Cursor");
    });
  });

  describe("doStream", () => {
    it("emits text-start, text-delta, text-end for assistant text", async () => {
      const parts = await streamWith([sdkAssistant([{ type: "text", text: "Hello" }])]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("text-start");
      expect(types).toContain("text-delta");
      expect(types).toContain("text-end");
    });

    it("emits reasoning parts for thinking events", async () => {
      const parts = await streamWith([sdkThinking("thinking...")]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("reasoning-start");
      expect(types).toContain("reasoning-delta");
      expect(types).toContain("reasoning-end");
    });

    it("emits tool-call for MCP tool_call started event", async () => {
      const parts = await streamWith([
        mcpToolCallStarted("tool_123", "browser", "open", { url: "https://example.com" }),
      ]);
      const toolCall = parts.find((part) => part.type === "tool-call");
      expect(toolCall).toMatchObject({
        type: "tool-call",
        toolCallId: "tool_123",
        toolName: "mcp__browser__open",
        providerExecuted: true,
      });
    });

    it("emits tool-input-start/delta/end before tool-call", async () => {
      const parts = await streamWith([
        mcpToolCallStarted("tool_123", "browser", "open", { url: "https://example.com" }),
      ]);
      const types = parts.map((part) => part.type);
      const toolInputStartIndex = types.indexOf("tool-input-start");
      const toolCallIndex = types.indexOf("tool-call");
      expect(toolInputStartIndex).toBeGreaterThan(-1);
      expect(types).toContain("tool-input-delta");
      expect(types).toContain("tool-input-end");
      expect(toolInputStartIndex).toBeLessThan(toolCallIndex);
    });

    it("emits tool-result for MCP tool_call completed event", async () => {
      const parts = await streamWith([
        mcpToolCallCompleted(
          "tool_123",
          "browser",
          "open",
          { url: "https://example.com" },
          "Opened https://example.com",
        ),
      ]);
      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "tool_123",
        toolName: "mcp__browser__open",
        result: "Opened https://example.com",
        isError: false,
      });
    });

    it("emits isError true for error MCP tool results", async () => {
      const parts = await streamWith([
        mcpToolCallCompleted("tool_err", "browser", "playwright", {}, "Error occurred", true),
      ]);
      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({ type: "tool-result", isError: true });
    });

    it("constructs qualified tool name as mcp__<provider>__<tool>", async () => {
      const parts = await streamWith([
        mcpToolCallStarted("tool_456", "browser", "screenshot", { mode: "snapshot" }),
      ]);
      const toolCall = parts.find((part) => part.type === "tool-call");
      expect(toolCall).toMatchObject({ toolName: "mcp__browser__screenshot" });
    });

    it("ignores non-MCP tool_call events (readToolCall)", async () => {
      const parts = await streamWith([
        readToolCallStarted("tool_read1", "/some/file.ts"),
        readToolCallCompleted("tool_read1", "/some/file.ts"),
      ]);
      const toolCalls = parts.filter(
        (part) => part.type === "tool-call" || part.type === "tool-result",
      );
      expect(toolCalls).toHaveLength(0);
    });

    it("handles full browser execution flow with tool calls", async () => {
      const parts = await streamWith([
        sdkSystem,
        sdkThinking("planning..."),
        sdkAssistant([{ type: "text", text: "\nSTEP_START|step-1|Test page\n" }]),
        mcpToolCallStarted("tool_1", "browser", "open", { url: "https://example.com" }),
        mcpToolCallCompleted(
          "tool_1",
          "browser",
          "open",
          { url: "https://example.com" },
          "Opened https://example.com",
        ),
        mcpToolCallStarted("tool_2", "browser", "screenshot", { mode: "snapshot" }),
        mcpToolCallCompleted(
          "tool_2",
          "browser",
          "screenshot",
          { mode: "snapshot" },
          '{"tree": "heading"}',
        ),
        mcpToolCallStarted("tool_3", "browser", "close", {}),
        mcpToolCallCompleted("tool_3", "browser", "close", {}, "Browser closed."),
        sdkAssistant([
          { type: "text", text: "\nSTEP_DONE|step-1|Done\nRUN_COMPLETED|passed|All good" },
        ]),
      ]);

      const toolCalls = parts.filter((part) => part.type === "tool-call");
      expect(toolCalls).toHaveLength(3);
      expect(toolCalls.map((part) => (part as { toolName: string }).toolName)).toEqual([
        "mcp__browser__open",
        "mcp__browser__screenshot",
        "mcp__browser__close",
      ]);

      const toolResults = parts.filter((part) => part.type === "tool-result");
      expect(toolResults).toHaveLength(3);
    });

    it("ends with finish part", async () => {
      const parts = await streamWith([sdkAssistant([{ type: "text", text: "Hi" }])]);
      const finish = parts.find((part) => part.type === "finish");
      expect(finish).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
    });

    it("emits error when cursor-agent is not signed in", async () => {
      const parts = await streamWith([]);
      const errorPart = parts.find((part) => part.type === "error");
      expect(errorPart).toBeDefined();
    });
  });
});
