import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

interface MockProcess extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  pid: number;
}

let mockResponses: string[] = [];
let capturedStdinWrites: string[] = [];

const createMockProcess = (): MockProcess => {
  capturedStdinWrites = [];
  const stdinStream = new Writable({
    write(chunk, _encoding, callback) {
      capturedStdinWrites.push(chunk.toString());
      callback();
    },
  });

  const ndjson = mockResponses.join("\n") + "\n";
  const stdoutStream = Readable.from([ndjson]);

  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    stdin: stdinStream,
    stdout: stdoutStream,
    killed: false,
    kill: vi.fn(),
    pid: 12345,
    ref: vi.fn(),
    unref: vi.fn(),
    connected: false,
    disconnect: vi.fn(),
    send: vi.fn(),
    exitCode: 0,
    signalCode: null,
    spawnargs: [],
    spawnfile: "test-agent",
    [Symbol.dispose]: vi.fn(),
  }) as MockProcess;
};

vi.mock("node:child_process", () => ({
  spawn: () => createMockProcess(),
  execFileSync: vi.fn(),
}));

import { createAcpModel } from "../../src/acp/client";

const defaultOptions: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "test prompt" }] }],
};

const jsonRpcResponse = (requestId: number, result: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", id: requestId, result });

const jsonRpcNotification = (method: string, params: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", method, params });

const initResponse = (requestId = 1) =>
  jsonRpcResponse(requestId, {
    protocolVersion: 1,
    agentCapabilities: { loadSession: false },
    agentInfo: { name: "test-agent", version: "1.0.0" },
  });

const sessionResponse = (sessionId: string, requestId = 2) =>
  jsonRpcResponse(requestId, { sessionId });

const promptResponse = (stopReason: string, requestId = 3) =>
  jsonRpcResponse(requestId, { stopReason });

const agentMessageNotification = (sessionId: string, text: string) =>
  jsonRpcNotification("session/update", {
    sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
  });

const thoughtNotification = (sessionId: string, text: string) =>
  jsonRpcNotification("session/update", {
    sessionId,
    update: { sessionUpdate: "thought_message_chunk", content: { type: "text", text } },
  });

const toolCallNotification = (
  sessionId: string,
  toolCallId: string,
  title: string,
  rawInput?: unknown,
) =>
  jsonRpcNotification("session/update", {
    sessionId,
    update: {
      sessionUpdate: "tool_call",
      toolCallId,
      title,
      kind: "execute",
      status: "pending",
      rawInput,
    },
  });

const toolCallCompletedNotification = (
  sessionId: string,
  toolCallId: string,
  title: string,
  resultText: string,
) =>
  jsonRpcNotification("session/update", {
    sessionId,
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId,
      title,
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: resultText } }],
    },
  });

const permissionRequest = (requestId: number, sessionId: string, toolCallId: string) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method: "session/request_permission",
    params: {
      sessionId,
      toolCall: { toolCallId, title: "Run command", kind: "execute", status: "pending" },
      options: [
        { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
        { optionId: "reject-once", name: "Reject", kind: "reject_once" },
      ],
    },
  });

afterEach(() => {
  vi.restoreAllMocks();
  mockResponses = [];
  capturedStdinWrites = [];
});

describe("createAcpModel", () => {
  describe("doGenerate", () => {
    it("completes full protocol flow and returns text content", async () => {
      mockResponses = [
        initResponse(),
        sessionResponse("sess_test"),
        agentMessageNotification("sess_test", "Hello from agent"),
        promptResponse("end_turn"),
      ];

      const result = await createAcpModel({ command: "test-agent" }).doGenerate(defaultOptions);
      expect(result.content).toEqual([{ type: "text", text: "Hello from agent" }]);
      expect(result.finishReason).toEqual({ unified: "stop", raw: "end_turn" });
    });

    it("handles thought messages as reasoning", async () => {
      mockResponses = [
        initResponse(),
        sessionResponse("sess_test"),
        thoughtNotification("sess_test", "thinking deeply..."),
        agentMessageNotification("sess_test", "Result"),
        promptResponse("end_turn"),
      ];

      const result = await createAcpModel({ command: "test-agent" }).doGenerate(defaultOptions);
      expect(result.content[0]).toEqual({ type: "reasoning", text: "thinking deeply..." });
      expect(result.content[1]).toEqual({ type: "text", text: "Result" });
    });

    it("handles tool calls and results", async () => {
      mockResponses = [
        initResponse(),
        sessionResponse("sess_test"),
        toolCallNotification("sess_test", "call_001", "List files", { path: "." }),
        toolCallCompletedNotification("sess_test", "call_001", "List files", "file1.ts\nfile2.ts"),
        agentMessageNotification("sess_test", "Found 2 files"),
        promptResponse("end_turn"),
      ];

      const result = await createAcpModel({ command: "test-agent" }).doGenerate(defaultOptions);
      const types = result.content.map((block) => block.type);
      expect(types).toContain("tool-call");
      expect(types).toContain("tool-result");
      expect(types).toContain("text");
    });

    it("maps max_tokens stop reason to length", async () => {
      mockResponses = [initResponse(), sessionResponse("sess_test"), promptResponse("max_tokens")];

      const result = await createAcpModel({ command: "test-agent" }).doGenerate(defaultOptions);
      expect(result.finishReason).toEqual({ unified: "length", raw: "max_tokens" });
    });

    it("returns proper response metadata", async () => {
      mockResponses = [initResponse(), sessionResponse("sess_test"), promptResponse("end_turn")];

      const result = await createAcpModel({ command: "test-agent" }).doGenerate(defaultOptions);
      expect(result.response.modelId).toBe("test-agent");
      expect(result.response.timestamp).toBeInstanceOf(Date);
      expect(result.response.id).toBeDefined();
    });

    it("handles empty content gracefully", async () => {
      mockResponses = [initResponse(), sessionResponse("sess_test"), promptResponse("end_turn")];

      const result = await createAcpModel({ command: "test-agent" }).doGenerate(defaultOptions);
      expect(result.content).toEqual([]);
    });
  });

  describe("doStream", () => {
    const collectStream = async (responses: string[]): Promise<LanguageModelV3StreamPart[]> => {
      mockResponses = responses;
      const { stream } = await createAcpModel({ command: "test-agent" }).doStream(defaultOptions);
      const parts: LanguageModelV3StreamPart[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }
      return parts;
    };

    it("streams text parts", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        agentMessageNotification("sess_test", "Hello"),
        promptResponse("end_turn"),
      ]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("stream-start");
      expect(types).toContain("text-start");
      expect(types).toContain("text-delta");
      expect(types).toContain("text-end");
      expect(types).toContain("finish");
    });

    it("streams reasoning parts", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        thoughtNotification("sess_test", "analyzing..."),
        promptResponse("end_turn"),
      ]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("reasoning-start");
      expect(types).toContain("reasoning-delta");
      expect(types).toContain("reasoning-end");
    });

    it("streams tool call parts", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        toolCallNotification("sess_test", "call_001", "Read file", { path: "test.ts" }),
        toolCallCompletedNotification("sess_test", "call_001", "Read file", "file content"),
        promptResponse("end_turn"),
      ]);
      const types = parts.map((part) => part.type);
      expect(types).toContain("tool-input-start");
      expect(types).toContain("tool-call");
      expect(types).toContain("tool-result");
    });

    it("emits response-metadata with session ID", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        promptResponse("end_turn"),
      ]);
      const metadata = parts.find((part) => part.type === "response-metadata");
      expect(metadata).toMatchObject({
        type: "response-metadata",
        id: "sess_test",
        modelId: "test-agent",
      });
    });

    it("ends with finish part containing stop reason", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        agentMessageNotification("sess_test", "Hi"),
        promptResponse("end_turn"),
      ]);
      const finish = parts.find((part) => part.type === "finish");
      expect(finish).toMatchObject({
        type: "finish",
        finishReason: { unified: "stop", raw: "end_turn" },
      });
    });

    it("handles permission requests by auto-approving", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        permissionRequest(100, "sess_test", "call_001"),
        agentMessageNotification("sess_test", "Approved and done"),
        promptResponse("end_turn"),
      ]);
      const textParts = parts.filter((part) => part.type === "text-delta");
      expect(textParts.length).toBeGreaterThan(0);
    });

    it("handles mixed content types in order", async () => {
      const parts = await collectStream([
        initResponse(),
        sessionResponse("sess_test"),
        thoughtNotification("sess_test", "planning..."),
        agentMessageNotification("sess_test", "Step 1"),
        toolCallNotification("sess_test", "t1", "Run test", { cmd: "vitest" }),
        toolCallCompletedNotification("sess_test", "t1", "Run test", "PASS"),
        agentMessageNotification("sess_test", "Tests passed"),
        promptResponse("end_turn"),
      ]);

      const contentTypes = parts
        .filter(
          (part) =>
            part.type === "reasoning-start" ||
            part.type === "text-start" ||
            part.type === "tool-call" ||
            part.type === "tool-result",
        )
        .map((part) => part.type);

      expect(contentTypes).toEqual([
        "reasoning-start",
        "text-start",
        "tool-call",
        "tool-result",
        "text-start",
      ]);
    });
  });
});
