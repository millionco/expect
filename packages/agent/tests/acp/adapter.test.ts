import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vite-plus/test";
import {
  adaptUpdateToContent,
  adaptUpdatesToContent,
  emitUpdateStreamParts,
  mapStopReason,
} from "../../src/acp/adapter";
import type { SessionUpdate } from "../../src/acp/schemas";

const agentTextUpdate = (text: string): SessionUpdate => ({
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text },
});

const thoughtUpdate = (text: string): SessionUpdate => ({
  sessionUpdate: "thought_message_chunk",
  content: { type: "text", text },
});

const toolCallUpdate = (toolCallId: string, title: string, rawInput?: unknown): SessionUpdate => ({
  sessionUpdate: "tool_call",
  toolCallId: toolCallId as typeof import("../../src/acp/schemas").ToolCallId.Type,
  title,
  kind: "execute",
  status: "pending",
  rawInput,
});

const toolCallCompletedUpdate = (
  toolCallId: string,
  title: string,
  resultContent?: string,
  rawOutput?: unknown,
): SessionUpdate => ({
  sessionUpdate: "tool_call_update",
  toolCallId: toolCallId as typeof import("../../src/acp/schemas").ToolCallId.Type,
  title,
  status: "completed",
  content: resultContent
    ? [{ type: "content", content: { type: "text", text: resultContent } }]
    : undefined,
  rawOutput,
});

const toolCallFailedUpdate = (toolCallId: string, title: string): SessionUpdate => ({
  sessionUpdate: "tool_call_update",
  toolCallId: toolCallId as typeof import("../../src/acp/schemas").ToolCallId.Type,
  title,
  status: "failed",
  content: [{ type: "content", content: { type: "text", text: "Error occurred" } }],
});

const planUpdate: SessionUpdate = {
  sessionUpdate: "plan",
  entries: [{ content: "Step 1", priority: "high", status: "pending" }],
};

const modeUpdate: SessionUpdate = {
  sessionUpdate: "current_mode_update",
  modeId: "code",
};

const userMessageUpdate: SessionUpdate = {
  sessionUpdate: "user_message_chunk",
  content: { type: "text", text: "Hi" },
};

const collectStreamParts = (updates: SessionUpdate[]): LanguageModelV3StreamPart[] => {
  const parts: LanguageModelV3StreamPart[] = [];
  const controller = {
    enqueue: (part: LanguageModelV3StreamPart) => parts.push(part),
  } as ReadableStreamDefaultController<LanguageModelV3StreamPart>;

  let blockCounter = 0;
  for (const update of updates) {
    blockCounter = emitUpdateStreamParts(update, controller, blockCounter);
  }
  return parts;
};

describe("ACP Adapter", () => {
  describe("mapStopReason", () => {
    it("maps end_turn to stop", () => {
      expect(mapStopReason("end_turn")).toEqual({ unified: "stop", raw: "end_turn" });
    });

    it("maps max_tokens to length", () => {
      expect(mapStopReason("max_tokens")).toEqual({ unified: "length", raw: "max_tokens" });
    });

    it("maps refused to content-filter", () => {
      expect(mapStopReason("refused")).toEqual({ unified: "content-filter", raw: "refused" });
    });

    it("maps cancelled to stop", () => {
      expect(mapStopReason("cancelled")).toEqual({ unified: "stop", raw: "cancelled" });
    });

    it("maps max_model_requests to stop", () => {
      expect(mapStopReason("max_model_requests")).toEqual({
        unified: "stop",
        raw: "max_model_requests",
      });
    });

    it("covers all stop reasons", () => {
      const allReasons = [
        "end_turn",
        "max_tokens",
        "max_model_requests",
        "refused",
        "cancelled",
      ] as const;
      for (const reason of allReasons) {
        expect(mapStopReason(reason).unified).toBeDefined();
      }
    });
  });

  describe("adaptUpdateToContent", () => {
    it("converts agent text message to text content", () => {
      const content = adaptUpdateToContent(agentTextUpdate("Hello world"));
      expect(content).toEqual([{ type: "text", text: "Hello world" }]);
    });

    it("converts thought message to reasoning content", () => {
      const content = adaptUpdateToContent(thoughtUpdate("analyzing..."));
      expect(content).toEqual([{ type: "reasoning", text: "analyzing..." }]);
    });

    it("converts tool_call to tool-call content", () => {
      const content = adaptUpdateToContent(
        toolCallUpdate("call_001", "Run command", { command: "ls" }),
      );
      expect(content).toEqual([
        {
          type: "tool-call",
          toolCallId: "call_001",
          toolName: "Run command",
          input: '{"command":"ls"}',
          providerExecuted: true,
        },
      ]);
    });

    it("converts completed tool_call_update to tool-result", () => {
      const content = adaptUpdateToContent(
        toolCallCompletedUpdate("call_001", "Run command", "output text"),
      );
      expect(content).toEqual([
        {
          type: "tool-result",
          toolCallId: "call_001",
          toolName: "Run command",
          result: "output text",
          isError: false,
        },
      ]);
    });

    it("uses rawOutput when available in tool-result", () => {
      const content = adaptUpdateToContent(
        toolCallCompletedUpdate("call_001", "Read file", undefined, { files: ["a.ts"] }),
      );
      expect(content[0]).toMatchObject({
        type: "tool-result",
        result: '{"files":["a.ts"]}',
      });
    });

    it("converts failed tool_call_update to error tool-result", () => {
      const content = adaptUpdateToContent(toolCallFailedUpdate("call_001", "Run command"));
      expect(content).toEqual([
        {
          type: "tool-result",
          toolCallId: "call_001",
          toolName: "Run command",
          result: "Error occurred",
          isError: true,
        },
      ]);
    });

    it("returns empty array for plan update", () => {
      expect(adaptUpdateToContent(planUpdate)).toEqual([]);
    });

    it("returns empty array for mode update", () => {
      expect(adaptUpdateToContent(modeUpdate)).toEqual([]);
    });

    it("returns empty array for user message", () => {
      expect(adaptUpdateToContent(userMessageUpdate)).toEqual([]);
    });

    it("uses 'unknown' as fallback tool name", () => {
      const update: SessionUpdate = {
        sessionUpdate: "tool_call",
        toolCallId: "call_x" as typeof import("../../src/acp/schemas").ToolCallId.Type,
        status: "pending",
        rawInput: {},
      };
      const content = adaptUpdateToContent(update);
      expect(content[0]).toMatchObject({ toolName: "unknown" });
    });

    it("handles string rawInput", () => {
      const content = adaptUpdateToContent(toolCallUpdate("call_001", "Echo", "hello"));
      expect(content[0]).toMatchObject({ input: "hello" });
    });

    it("handles undefined rawInput", () => {
      const content = adaptUpdateToContent(toolCallUpdate("call_001", "Noop"));
      expect(content[0]).toMatchObject({ input: "{}" });
    });
  });

  describe("adaptUpdatesToContent", () => {
    it("collects content from multiple updates", () => {
      const content = adaptUpdatesToContent([
        agentTextUpdate("Hello"),
        thoughtUpdate("thinking"),
        toolCallUpdate("t1", "Read", { path: "test.ts" }),
        toolCallCompletedUpdate("t1", "Read", "file contents"),
      ]);
      expect(content.map((block) => block.type)).toEqual([
        "text",
        "reasoning",
        "tool-call",
        "tool-result",
      ]);
    });

    it("filters out non-content updates", () => {
      const content = adaptUpdatesToContent([
        agentTextUpdate("Hello"),
        planUpdate,
        modeUpdate,
        userMessageUpdate,
      ]);
      expect(content).toEqual([{ type: "text", text: "Hello" }]);
    });

    it("returns empty for no updates", () => {
      expect(adaptUpdatesToContent([])).toEqual([]);
    });
  });

  describe("emitUpdateStreamParts", () => {
    it("emits text-start, text-delta, text-end for agent message", () => {
      const parts = collectStreamParts([agentTextUpdate("Hello")]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("text-start");
      expect(types).toContain("text-delta");
      expect(types).toContain("text-end");
    });

    it("emits reasoning-start, reasoning-delta, reasoning-end for thought", () => {
      const parts = collectStreamParts([thoughtUpdate("analyzing...")]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("reasoning-start");
      expect(types).toContain("reasoning-delta");
      expect(types).toContain("reasoning-end");
    });

    it("emits tool-input-start/delta/end and tool-call for tool_call", () => {
      const parts = collectStreamParts([toolCallUpdate("call_001", "Run command", { cmd: "ls" })]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("tool-input-start");
      expect(types).toContain("tool-input-delta");
      expect(types).toContain("tool-input-end");
      expect(types).toContain("tool-call");
    });

    it("tool-input parts come before tool-call", () => {
      const parts = collectStreamParts([toolCallUpdate("call_001", "Run command", { cmd: "ls" })]);
      const types = parts.map((part) => part.type);
      const inputStartIdx = types.indexOf("tool-input-start");
      const toolCallIdx = types.indexOf("tool-call");
      expect(inputStartIdx).toBeLessThan(toolCallIdx);
    });

    it("emits tool-result for completed tool_call_update", () => {
      const parts = collectStreamParts([
        toolCallCompletedUpdate("call_001", "Read file", "contents"),
      ]);
      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "call_001",
        result: "contents",
        isError: false,
      });
    });

    it("emits tool-result with isError for failed tool_call_update", () => {
      const parts = collectStreamParts([toolCallFailedUpdate("call_001", "Run command")]);
      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({ isError: true });
    });

    it("does not emit parts for plan updates", () => {
      const parts = collectStreamParts([planUpdate]);
      expect(parts).toHaveLength(0);
    });

    it("does not emit parts for mode updates", () => {
      const parts = collectStreamParts([modeUpdate]);
      expect(parts).toHaveLength(0);
    });

    it("increments block counter across updates", () => {
      const parts = collectStreamParts([agentTextUpdate("First"), agentTextUpdate("Second")]);
      const textStarts = parts.filter((part) => part.type === "text-start");
      expect(textStarts).toHaveLength(2);
      const ids = textStarts.map((part) => (part as { id: string }).id);
      expect(ids[0]).toBe("block-0");
      expect(ids[1]).toBe("block-1");
    });

    it("handles full conversation flow", () => {
      const parts = collectStreamParts([
        thoughtUpdate("planning..."),
        agentTextUpdate("I'll read the file"),
        toolCallUpdate("t1", "Read file", { path: "test.ts" }),
        toolCallCompletedUpdate("t1", "Read file", "file contents"),
        agentTextUpdate("The file contains..."),
      ]);

      const types = parts.map((part) => part.type);
      expect(types).toContain("reasoning-start");
      expect(types).toContain("text-start");
      expect(types).toContain("tool-call");
      expect(types).toContain("tool-result");
    });

    it("tool-call uses providerExecuted true", () => {
      const parts = collectStreamParts([toolCallUpdate("call_001", "Run", {})]);
      const toolCall = parts.find((part) => part.type === "tool-call");
      expect(toolCall).toMatchObject({ providerExecuted: true });
    });
  });
});
