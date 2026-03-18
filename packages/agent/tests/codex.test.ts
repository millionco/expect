import { describe, expect, it, vi } from "vite-plus/test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

let pendingEvents: Record<string, unknown>[] = [];
let pendingItems: Record<string, unknown>[] = [];

vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    startThread = () => ({
      id: "thread-from-sdk",
      run: async () => ({
        items: pendingItems,
        usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 30 },
        finalResponse: "",
      }),
      runStreamed: async () => ({
        events: (async function* () {
          for (const event of pendingEvents) yield event;
        })(),
      }),
    });
    resumeThread = (_threadId: string) => ({
      id: _threadId,
      run: async () => ({ items: pendingItems, usage: null, finalResponse: "" }),
      runStreamed: async () => ({
        events: (async function* () {
          for (const event of pendingEvents) yield event;
        })(),
      }),
    });
  },
}));

import { createCodexModel } from "../src/codex";

const defaultOptions: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
};

const completedItem = (item: Record<string, unknown>) => ({ type: "item.completed", item });

const generateWith = (items: Record<string, unknown>[]) => {
  pendingItems = items;
  return createCodexModel().doGenerate(defaultOptions);
};

const streamWith = async (
  events: Record<string, unknown>[],
): Promise<LanguageModelV3StreamPart[]> => {
  pendingEvents = events;
  const { stream } = await createCodexModel().doStream(defaultOptions);
  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
};

describe("createCodexModel", () => {
  describe("doGenerate", () => {
    it("converts agent_message to text", async () => {
      const { content } = await generateWith([{ id: "i0", type: "agent_message", text: "Hello" }]);
      expect(content).toEqual([{ type: "text", text: "Hello" }]);
    });

    it("converts reasoning", async () => {
      const { content } = await generateWith([
        { id: "i0", type: "reasoning", text: "thinking..." },
      ]);
      expect(content).toEqual([{ type: "reasoning", text: "thinking..." }]);
    });

    it("converts command_execution to tool-call + tool-result", async () => {
      const { content } = await generateWith([
        {
          id: "i1",
          type: "command_execution",
          command: "ls",
          aggregated_output: "file.ts",
          exit_code: 0,
          status: "completed",
        },
      ]);
      expect(content).toHaveLength(2);
      expect(content[0]).toMatchObject({
        type: "tool-call",
        toolName: "exec",
        providerExecuted: true,
      });
      expect(content[1]).toMatchObject({ type: "tool-result", toolCallId: "i1", isError: false });
    });

    it("marks failed commands as isError", async () => {
      const { content } = await generateWith([
        {
          id: "i1",
          type: "command_execution",
          command: "false",
          aggregated_output: "",
          exit_code: 1,
          status: "failed",
        },
      ]);
      expect(content[1]).toMatchObject({ type: "tool-result", isError: true });
    });

    it("converts file_change to patch tool", async () => {
      const { content } = await generateWith([
        {
          id: "fc1",
          type: "file_change",
          changes: [{ path: "a.ts", kind: "update" }],
          status: "completed",
        },
      ]);
      expect(content[0]).toMatchObject({ type: "tool-call", toolName: "patch" });
    });

    it("converts mcp_tool_call with mcp__server__tool naming", async () => {
      const { content } = await generateWith([
        {
          id: "mcp1",
          type: "mcp_tool_call",
          server: "fs",
          tool: "read",
          arguments: {},
          status: "completed",
        },
      ]);
      expect(content[0]).toMatchObject({ type: "tool-call", toolName: "mcp__fs__read" });
    });

    it("converts web_search", async () => {
      const { content } = await generateWith([{ id: "ws1", type: "web_search", query: "docs" }]);
      expect(content[0]).toMatchObject({ type: "tool-call", toolName: "web_search" });
    });

    it("returns usage from thread.run", async () => {
      const result = await generateWith([{ id: "i0", type: "agent_message", text: "Hi" }]);
      expect(result.usage.inputTokens.total).toBe(100);
      expect(result.usage.inputTokens.cacheRead).toBe(50);
      expect(result.usage.outputTokens.total).toBe(30);
    });

    it("exposes sessionId in providerMetadata", async () => {
      const result = await generateWith([{ id: "i0", type: "agent_message", text: "Hi" }]);
      expect(result.providerMetadata?.["browser-tester-agent"]).toEqual({
        sessionId: "thread-from-sdk",
      });
    });
  });

  describe("doStream", () => {
    it("emits text parts for agent_message", async () => {
      const parts = await streamWith([
        completedItem({ id: "i0", type: "agent_message", text: "Hello" }),
      ]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("text-start");
      expect(types).toContain("text-delta");
      expect(types).toContain("text-end");
    });

    it("emits reasoning parts", async () => {
      const parts = await streamWith([completedItem({ id: "i0", type: "reasoning", text: "hmm" })]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("reasoning-start");
      expect(types).toContain("reasoning-delta");
      expect(types).toContain("reasoning-end");
    });

    it("emits tool-call + tool-result for command_execution", async () => {
      const parts = await streamWith([
        completedItem({
          id: "i1",
          type: "command_execution",
          command: "ls",
          aggregated_output: "out",
          exit_code: 0,
          status: "completed",
        }),
      ]);
      expect(parts.some((part) => part.type === "tool-call")).toBe(true);
      expect(parts.some((part) => part.type === "tool-result")).toBe(true);
    });

    it("exposes sessionId from thread.started event", async () => {
      const parts = await streamWith([
        { type: "thread.started", thread_id: "thread-abc" },
        completedItem({ id: "i0", type: "agent_message", text: "Hi" }),
      ]);
      const finish = parts.find((part) => part.type === "finish");
      expect(finish).toBeDefined();
    });

    it("skips non item.completed events (only emits metadata and finish)", async () => {
      const parts = await streamWith([
        { type: "thread.started", thread_id: "t1" },
        { type: "turn.started" },
        {
          type: "item.started",
          item: { id: "i1", type: "command_execution", status: "in_progress" },
        },
        {
          type: "turn.completed",
          usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 50 },
        },
      ]);
      const contentTypes = parts
        .map((part) => part.type)
        .filter(
          (partType) =>
            partType !== "finish" &&
            partType !== "stream-start" &&
            partType !== "response-metadata",
        );
      expect(contentTypes).toEqual([]);
    });

    it("ends with finish part", async () => {
      const parts = await streamWith([
        completedItem({ id: "i0", type: "agent_message", text: "Hi" }),
      ]);
      const last = parts[parts.length - 1];
      expect(last.type).toBe("finish");
    });
  });
});
