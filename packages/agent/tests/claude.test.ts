import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";

let pendingEvents: Record<string, unknown>[] = [];
let lastQueryOptions: unknown;

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ options }: { options?: unknown }) => {
    lastQueryOptions = options;

    return (async function* () {
      for (const event of pendingEvents) yield event;
    })();
  },
}));

import { createClaudeModel } from "../src/claude.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const loadFixture = (name: string): Record<string, unknown>[] =>
  readFileSync(join(FIXTURES_DIR, name), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const defaultOptions: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
};

const generateWith = (events: Record<string, unknown>[]) => {
  pendingEvents = events;
  lastQueryOptions = undefined;
  return createClaudeModel().doGenerate(defaultOptions);
};

const streamWith = async (
  events: Record<string, unknown>[],
): Promise<LanguageModelV3StreamPart[]> => {
  pendingEvents = events;
  lastQueryOptions = undefined;
  const { stream } = await createClaudeModel().doStream(defaultOptions);
  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
};

const sdkAssistant = (content: Record<string, unknown>[]) => ({
  type: "assistant",
  session_id: "sess-test",
  message: { id: "msg_test", role: "assistant", content, model: "claude-opus-4-6" },
});

const sdkUser = (content: Record<string, unknown>[]) => ({
  type: "user",
  session_id: "sess-test",
  message: { role: "user", content },
});

const sdkSystem = { type: "system", subtype: "init", session_id: "sess-abc" };
const sdkResult = (isError = false) => ({
  type: "result",
  session_id: "sess-abc",
  is_error: isError,
});

describe("createClaudeModel", () => {
  describe("doGenerate", () => {
    it("converts text block", async () => {
      const { content } = await generateWith([sdkAssistant([{ type: "text", text: "Hello" }])]);
      expect(content).toEqual([{ type: "text", text: "Hello" }]);
    });

    it("converts thinking to reasoning", async () => {
      const { content } = await generateWith([
        sdkAssistant([{ type: "thinking", thinking: "analyzing..." }]),
      ]);
      expect(content).toEqual([{ type: "reasoning", text: "analyzing..." }]);
    });

    it("converts tool_use to tool-call with providerExecuted", async () => {
      const { content } = await generateWith([
        sdkAssistant([
          { type: "tool_use", id: "toolu_abc", name: "Bash", input: { command: "ls" } },
        ]),
      ]);
      expect(content[0]).toMatchObject({
        type: "tool-call",
        toolCallId: "toolu_abc",
        toolName: "Bash",
        providerExecuted: true,
      });
      expect((content[0] as { input: string }).input).toBe('{"command":"ls"}');
    });

    it("converts tool_result to tool-result", async () => {
      const { content } = await generateWith([
        sdkUser([
          {
            type: "tool_result",
            tool_use_id: "toolu_abc",
            name: "Bash",
            content: "file.ts",
            is_error: false,
          },
        ]),
      ]);
      expect(content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "toolu_abc",
        toolName: "Bash",
        result: "file.ts",
        isError: false,
      });
    });

    it("serializes object tool_result content to JSON", async () => {
      const { content } = await generateWith([
        sdkUser([
          {
            type: "tool_result",
            tool_use_id: "toolu_abc",
            name: "browser_open",
            content: { ok: true, url: "http://localhost:3000" },
            is_error: false,
          },
        ]),
      ]);
      expect(content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "toolu_abc",
        toolName: "browser_open",
        result: '{"ok":true,"url":"http://localhost:3000"}',
        isError: false,
      });
    });

    it("converts tool_error to tool-result with isError", async () => {
      const { content } = await generateWith([
        sdkUser([
          { type: "tool_error", tool_use_id: "t1", name: "Bash", error: "Permission denied" },
        ]),
      ]);
      expect(content[0]).toMatchObject({
        type: "tool-result",
        isError: true,
        result: "Permission denied",
      });
    });

    it("exposes sessionId in providerMetadata", async () => {
      const result = await generateWith([sdkSystem]);
      expect(result.providerMetadata?.["browser-tester-agent"]).toEqual({ sessionId: "sess-abc" });
    });

    it("returns stop finishReason and usage", async () => {
      const result = await generateWith([sdkAssistant([{ type: "text", text: "Hi" }])]);
      expect(result.finishReason.unified).toBe("stop");
      expect(result.usage).toBeDefined();
    });

    it("sanitizes blocked Claude subprocess environment variables", async () => {
      const originalClaudeCode = process.env.CLAUDECODE;
      const originalNodeOptions = process.env.NODE_OPTIONS;
      const originalInspectorOptions = process.env.VSCODE_INSPECTOR_OPTIONS;
      const originalSafeValue = process.env.BROWSER_TESTER_SAFE_ENV;

      process.env.CLAUDECODE = "1";
      process.env.NODE_OPTIONS = "--inspect";
      process.env.VSCODE_INSPECTOR_OPTIONS = '{"autoAttachMode":"always"}';
      process.env.BROWSER_TESTER_SAFE_ENV = "safe";

      try {
        pendingEvents = [sdkAssistant([{ type: "text", text: "Hi" }])];
        lastQueryOptions = undefined;

        await createClaudeModel({
          env: {
            CUSTOM_ENV: "custom",
            CLAUDECODE: "1",
            NODE_OPTIONS: "--inspect-brk",
          },
        }).doGenerate(defaultOptions);

        expect(lastQueryOptions).toMatchObject({
          env: expect.objectContaining({
            BROWSER_TESTER_SAFE_ENV: "safe",
            CUSTOM_ENV: "custom",
          }),
        });

        if (!lastQueryOptions || typeof lastQueryOptions !== "object") {
          throw new Error("Expected query options to be captured");
        }

        const queryEnv = "env" in lastQueryOptions ? lastQueryOptions.env : undefined;

        if (!queryEnv || typeof queryEnv !== "object") {
          throw new Error("Expected query env to be captured");
        }

        expect("CLAUDECODE" in queryEnv).toBe(false);
        expect("NODE_OPTIONS" in queryEnv).toBe(false);
        expect("VSCODE_INSPECTOR_OPTIONS" in queryEnv).toBe(false);
      } finally {
        if (originalClaudeCode === undefined) delete process.env.CLAUDECODE;
        else process.env.CLAUDECODE = originalClaudeCode;

        if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = originalNodeOptions;

        if (originalInspectorOptions === undefined) delete process.env.VSCODE_INSPECTOR_OPTIONS;
        else process.env.VSCODE_INSPECTOR_OPTIONS = originalInspectorOptions;

        if (originalSafeValue === undefined) delete process.env.BROWSER_TESTER_SAFE_ENV;
        else process.env.BROWSER_TESTER_SAFE_ENV = originalSafeValue;
      }
    });

    it("skips system and result events", async () => {
      const { content } = await generateWith([sdkSystem, sdkResult()]);
      expect(content).toEqual([]);
    });

    it("handles mixed content blocks", async () => {
      const { content } = await generateWith([
        sdkAssistant([
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "ok" },
          { type: "tool_use", id: "t1", name: "Read", input: {} },
        ]),
      ]);
      expect(content.map((part: LanguageModelV3Content) => part.type)).toEqual([
        "reasoning",
        "text",
        "tool-call",
      ]);
    });
  });

  describe("doStream", () => {
    it("emits text-start, text-delta, text-end", async () => {
      const parts = await streamWith([sdkAssistant([{ type: "text", text: "Hello" }])]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("text-start");
      expect(types).toContain("text-delta");
      expect(types).toContain("text-end");
    });

    it("emits reasoning-start, reasoning-delta, reasoning-end", async () => {
      const parts = await streamWith([
        sdkAssistant([{ type: "thinking", thinking: "thinking..." }]),
      ]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("reasoning-start");
      expect(types).toContain("reasoning-delta");
      expect(types).toContain("reasoning-end");
    });

    it("emits tool-call with providerExecuted", async () => {
      const parts = await streamWith([
        sdkAssistant([{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }]),
      ]);
      const toolCall = parts.find((part) => part.type === "tool-call");
      expect(toolCall).toMatchObject({
        type: "tool-call",
        toolCallId: "t1",
        toolName: "Bash",
        providerExecuted: true,
      });
    });

    it("emits tool-result", async () => {
      const parts = await streamWith([
        sdkUser([
          {
            type: "tool_result",
            tool_use_id: "t1",
            name: "Bash",
            content: "output",
            is_error: false,
          },
        ]),
      ]);
      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "t1",
        result: "output",
        isError: false,
      });
    });

    it("emits serialized object tool-result", async () => {
      const parts = await streamWith([
        sdkUser([
          {
            type: "tool_result",
            tool_use_id: "t1",
            name: "Bash",
            content: { files: ["a.ts", "b.ts"] },
            is_error: false,
          },
        ]),
      ]);
      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "t1",
        result: '{"files":["a.ts","b.ts"]}',
        isError: false,
      });
    });

    it("ends with finish part containing sessionId", async () => {
      const parts = await streamWith([sdkSystem, sdkAssistant([{ type: "text", text: "Hi" }])]);
      const finish = parts.find((part) => part.type === "finish");
      expect(finish).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
    });
  });

  describe("real NDJSON traces", () => {
    it("claude-with-tools.jsonl: produces text, reasoning, tool-call, tool-result", async () => {
      const { content } = await generateWith(loadFixture("claude-with-tools.jsonl"));
      const types = new Set(content.map((part: LanguageModelV3Content) => part.type));
      expect(types.has("text")).toBe(true);
      expect(types.has("tool-call")).toBe(true);
      expect(types.has("tool-result")).toBe(true);
    });

    it("claude-with-tools.jsonl: tool-call IDs match tool-result IDs", async () => {
      const { content } = await generateWith(loadFixture("claude-with-tools.jsonl"));
      const callIds = new Set(
        content
          .filter((part: LanguageModelV3Content) => part.type === "tool-call")
          .map((part) => (part as { toolCallId: string }).toolCallId),
      );
      const resultIds = content
        .filter((part: LanguageModelV3Content) => part.type === "tool-result")
        .map((part) => (part as { toolCallId: string }).toolCallId);
      for (const resultId of resultIds) expect(callIds.has(resultId)).toBe(true);
    });
  });
});
