import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { createAcpModel } from "../../src/acp/client";

const ECHO_AGENT_PATH = join(import.meta.dirname, "fixtures", "echo-agent.mjs");

describe("ACP e2e with echo-agent", () => {
  describe("doGenerate", () => {
    it("runs full protocol and returns echoed text", async () => {
      const model = createAcpModel({ command: "node", commandArgs: [ECHO_AGENT_PATH] });

      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hello world" }] }],
      });

      expect(result.content.some((block) => block.type === "text")).toBe(true);
      const textBlocks = result.content.filter((block) => block.type === "text");
      const allText = textBlocks.map((block) => (block as { text: string }).text).join(" ");
      expect(allText).toContain("hello world");
    });

    it("returns reasoning from thought messages", async () => {
      const model = createAcpModel({ command: "node", commandArgs: [ECHO_AGENT_PATH] });

      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "think about this" }] }],
      });

      const reasoningBlocks = result.content.filter((block) => block.type === "reasoning");
      expect(reasoningBlocks.length).toBeGreaterThan(0);
      const reasoningText = (reasoningBlocks[0] as { text: string }).text;
      expect(reasoningText).toContain("think about this");
    });

    it("returns tool-call and tool-result from echo tool", async () => {
      const model = createAcpModel({ command: "node", commandArgs: [ECHO_AGENT_PATH] });

      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "test tools" }] }],
      });

      const types = result.content.map((block) => block.type);
      expect(types).toContain("tool-call");
      expect(types).toContain("tool-result");

      const toolCall = result.content.find((block) => block.type === "tool-call");
      expect(toolCall).toMatchObject({
        type: "tool-call",
        toolCallId: "call_echo_1",
        toolName: "echo",
        providerExecuted: true,
      });

      const toolResult = result.content.find((block) => block.type === "tool-result");
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "call_echo_1",
        isError: false,
      });
      expect((toolResult as { result: string }).result).toContain("Echo: test tools");
    });

    it("returns end_turn stop reason", async () => {
      const model = createAcpModel({ command: "node", commandArgs: [ECHO_AGENT_PATH] });

      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      });

      expect(result.finishReason).toEqual({ unified: "stop", raw: "end_turn" });
    });

    it("returns all content types in correct order", async () => {
      const model = createAcpModel({ command: "node", commandArgs: [ECHO_AGENT_PATH] });

      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "ordered test" }] }],
      });

      const types = result.content.map((block) => block.type);
      expect(types).toEqual(["reasoning", "tool-call", "tool-result", "text"]);
    });
  });

  describe("doStream", () => {
    const collectStream = async (prompt: string): Promise<LanguageModelV3StreamPart[]> => {
      const model = createAcpModel({ command: "node", commandArgs: [ECHO_AGENT_PATH] });
      const { stream } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      });
      const parts: LanguageModelV3StreamPart[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }
      return parts;
    };

    it("streams complete protocol flow", async () => {
      const parts = await collectStream("streaming test");
      const types = parts.map((part) => part.type);

      expect(types).toContain("stream-start");
      expect(types).toContain("response-metadata");
      expect(types).toContain("reasoning-start");
      expect(types).toContain("reasoning-delta");
      expect(types).toContain("reasoning-end");
      expect(types).toContain("tool-input-start");
      expect(types).toContain("tool-call");
      expect(types).toContain("tool-result");
      expect(types).toContain("text-start");
      expect(types).toContain("text-delta");
      expect(types).toContain("text-end");
      expect(types).toContain("finish");
    });

    it("streams text containing the prompt", async () => {
      const parts = await collectStream("hello from e2e");
      const textDeltas = parts
        .filter((part) => part.type === "text-delta")
        .map((part) => (part as { delta: string }).delta);
      const fullText = textDeltas.join("");
      expect(fullText).toContain("hello from e2e");
    });

    it("streams reasoning containing the prompt", async () => {
      const parts = await collectStream("deep thought");
      const reasoningDeltas = parts
        .filter((part) => part.type === "reasoning-delta")
        .map((part) => (part as { delta: string }).delta);
      const fullReasoning = reasoningDeltas.join("");
      expect(fullReasoning).toContain("deep thought");
    });

    it("streams tool call with correct metadata", async () => {
      const parts = await collectStream("tool test");

      const toolCall = parts.find((part) => part.type === "tool-call");
      expect(toolCall).toMatchObject({
        type: "tool-call",
        toolCallId: "call_echo_1",
        toolName: "echo",
        providerExecuted: true,
      });

      const toolResult = parts.find((part) => part.type === "tool-result");
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "call_echo_1",
        isError: false,
      });
    });

    it("ends with finish containing end_turn", async () => {
      const parts = await collectStream("finish test");
      const finish = parts.find((part) => part.type === "finish");
      expect(finish).toMatchObject({
        type: "finish",
        finishReason: { unified: "stop", raw: "end_turn" },
      });
    });

    it("emits response-metadata with session ID", async () => {
      const parts = await collectStream("metadata test");
      const metadata = parts.find((part) => part.type === "response-metadata");
      expect(metadata).toBeDefined();
      expect((metadata as { id: string }).id).toMatch(/^sess_echo_/);
    });

    it("content parts appear in correct order", async () => {
      const parts = await collectStream("order test");
      const contentTypes = parts
        .filter(
          (part) =>
            part.type === "reasoning-start" ||
            part.type === "tool-call" ||
            part.type === "tool-result" ||
            part.type === "text-start",
        )
        .map((part) => part.type);

      expect(contentTypes).toEqual(["reasoning-start", "tool-call", "tool-result", "text-start"]);
    });
  });
});
