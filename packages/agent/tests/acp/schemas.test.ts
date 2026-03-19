import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  AgentCapabilities,
  AgentMessageChunkUpdate,
  AcpMcpServer,
  ContentBlock,
  CurrentModeUpdate,
  InitializeRequest,
  InitializeResponse,
  NewSessionResponse,
  PlanUpdate,
  PromptResponse,
  RequestPermissionParams,
  SessionUpdate,
  SessionUpdateNotification,
  ThoughtMessageChunkUpdate,
  ToolCallStatusUpdate,
  ToolCallUpdate,
} from "../../src/acp/schemas";

const decode =
  <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  (data: unknown) =>
    Schema.decodeUnknownSync(schema)(data);

describe("ACP Schemas", () => {
  describe("ContentBlock", () => {
    it("decodes text content", () => {
      const result = decode(ContentBlock)({ type: "text", text: "Hello world" });
      expect(result).toEqual({ type: "text", text: "Hello world" });
    });

    it("decodes image content", () => {
      const result = decode(ContentBlock)({
        type: "image",
        data: "base64data",
        mimeType: "image/png",
      });
      expect(result).toEqual({ type: "image", data: "base64data", mimeType: "image/png" });
    });

    it("decodes resource_link content", () => {
      const result = decode(ContentBlock)({
        type: "resource_link",
        uri: "file:///test.ts",
        name: "test.ts",
      });
      expect(result).toEqual({ type: "resource_link", uri: "file:///test.ts", name: "test.ts" });
    });

    it("decodes resource content with text", () => {
      const result = decode(ContentBlock)({
        type: "resource",
        resource: { uri: "file:///test.ts", text: "content" },
      });
      expect(result).toEqual({
        type: "resource",
        resource: { uri: "file:///test.ts", text: "content" },
      });
    });

    it("rejects invalid content type", () => {
      expect(() => decode(ContentBlock)({ type: "invalid" })).toThrow();
    });
  });

  describe("InitializeRequest", () => {
    it("decodes full request", () => {
      const result = decode(InitializeRequest)({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: false },
          terminal: true,
        },
        clientInfo: { name: "test-client", version: "1.0.0" },
      });
      expect(result.protocolVersion).toBe(1);
      expect(result.clientInfo?.name).toBe("test-client");
    });

    it("decodes minimal request", () => {
      const result = decode(InitializeRequest)({ protocolVersion: 1 });
      expect(result.protocolVersion).toBe(1);
    });
  });

  describe("InitializeResponse", () => {
    it("decodes full response", () => {
      const result = decode(InitializeResponse)({
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, embeddedContext: true },
          mcpCapabilities: { http: true },
        },
        agentInfo: { name: "test-agent", title: "Test Agent", version: "2.0.0" },
        authMethods: [{ id: "oauth", type: "oauth2" }],
      });
      expect(result.protocolVersion).toBe(1);
      expect(result.agentCapabilities?.loadSession).toBe(true);
      expect(result.agentCapabilities?.promptCapabilities?.image).toBe(true);
      expect(result.agentInfo?.title).toBe("Test Agent");
    });

    it("decodes minimal response", () => {
      const result = decode(InitializeResponse)({ protocolVersion: 1 });
      expect(result.protocolVersion).toBe(1);
    });
  });

  describe("AgentCapabilities", () => {
    it("decodes empty capabilities", () => {
      const result = decode(AgentCapabilities)({});
      expect(result).toEqual({});
    });

    it("decodes full capabilities", () => {
      const result = decode(AgentCapabilities)({
        loadSession: true,
        promptCapabilities: { image: true, audio: false, embeddedContext: true },
        mcpCapabilities: { http: true, sse: false },
        sessionCapabilities: { list: true },
      });
      expect(result.loadSession).toBe(true);
      expect(result.mcpCapabilities?.http).toBe(true);
    });
  });

  describe("NewSessionResponse", () => {
    it("decodes session response", () => {
      const result = decode(NewSessionResponse)({ sessionId: "sess_abc123" });
      expect(result.sessionId).toBe("sess_abc123");
    });

    it("decodes response with modes", () => {
      const result = decode(NewSessionResponse)({
        sessionId: "sess_abc123",
        modes: {
          currentModeId: "code",
          availableModes: [
            { id: "ask", name: "Ask" },
            { id: "code", name: "Code", description: "Write code" },
          ],
        },
      });
      expect(result.modes?.currentModeId).toBe("code");
      expect(result.modes?.availableModes).toHaveLength(2);
    });
  });

  describe("PromptResponse", () => {
    it("decodes end_turn", () => {
      const result = decode(PromptResponse)({ stopReason: "end_turn" });
      expect(result.stopReason).toBe("end_turn");
    });

    it("decodes cancelled", () => {
      const result = decode(PromptResponse)({ stopReason: "cancelled" });
      expect(result.stopReason).toBe("cancelled");
    });

    it("decodes all stop reasons", () => {
      for (const reason of [
        "end_turn",
        "max_tokens",
        "max_model_requests",
        "refused",
        "cancelled",
      ]) {
        const result = decode(PromptResponse)({ stopReason: reason });
        expect(result.stopReason).toBe(reason);
      }
    });

    it("rejects invalid stop reason", () => {
      expect(() => decode(PromptResponse)({ stopReason: "invalid" })).toThrow();
    });
  });

  describe("SessionUpdate", () => {
    it("decodes agent_message_chunk", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      });
      expect(result.sessionUpdate).toBe("agent_message_chunk");
      expect((result as typeof AgentMessageChunkUpdate.Type).content.type).toBe("text");
    });

    it("decodes user_message_chunk", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "Hi" },
      });
      expect(result.sessionUpdate).toBe("user_message_chunk");
    });

    it("decodes thought_message_chunk", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "thought_message_chunk",
        content: { type: "text", text: "thinking..." },
      });
      expect(result.sessionUpdate).toBe("thought_message_chunk");
      expect((result as typeof ThoughtMessageChunkUpdate.Type).content.text).toBe("thinking...");
    });

    it("decodes tool_call", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "tool_call",
        toolCallId: "call_001",
        title: "Reading file",
        kind: "read",
        status: "pending",
      });
      expect(result.sessionUpdate).toBe("tool_call");
      expect((result as typeof ToolCallUpdate.Type).toolCallId).toBe("call_001");
      expect((result as typeof ToolCallUpdate.Type).kind).toBe("read");
    });

    it("decodes tool_call_update with content", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_001",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "Result text" } }],
      });
      expect(result.sessionUpdate).toBe("tool_call_update");
      expect((result as typeof ToolCallStatusUpdate.Type).status).toBe("completed");
    });

    it("decodes tool_call_update with diff content", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_002",
        status: "completed",
        content: [{ type: "diff", path: "/test.ts", oldText: "old", newText: "new" }],
      });
      expect(result.sessionUpdate).toBe("tool_call_update");
    });

    it("decodes plan", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "plan",
        entries: [
          { content: "Step 1", priority: "high", status: "pending" },
          { content: "Step 2", priority: "medium", status: "in_progress" },
        ],
      });
      expect(result.sessionUpdate).toBe("plan");
      expect((result as typeof PlanUpdate.Type).entries).toHaveLength(2);
    });

    it("decodes current_mode_update", () => {
      const result = decode(SessionUpdate)({
        sessionUpdate: "current_mode_update",
        modeId: "code",
      });
      expect(result.sessionUpdate).toBe("current_mode_update");
      expect((result as typeof CurrentModeUpdate.Type).modeId).toBe("code");
    });

    it("rejects invalid sessionUpdate", () => {
      expect(() => decode(SessionUpdate)({ sessionUpdate: "invalid" })).toThrow();
    });
  });

  describe("SessionUpdateNotification", () => {
    it("decodes notification with agent message", () => {
      const result = decode(SessionUpdateNotification)({
        sessionId: "sess_abc",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        },
      });
      expect(result.sessionId).toBe("sess_abc");
      expect(result.update.sessionUpdate).toBe("agent_message_chunk");
    });
  });

  describe("RequestPermissionParams", () => {
    it("decodes permission request", () => {
      const result = decode(RequestPermissionParams)({
        sessionId: "sess_abc",
        toolCall: {
          toolCallId: "call_001",
          title: "Run command",
          kind: "execute",
          status: "pending",
        },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        ],
      });
      expect(result.sessionId).toBe("sess_abc");
      expect(result.options).toHaveLength(2);
      expect(result.options[0].kind).toBe("allow_once");
    });
  });

  describe("AcpMcpServer", () => {
    it("decodes stdio server", () => {
      const result = decode(AcpMcpServer)({
        name: "filesystem",
        command: "/path/to/server",
        args: ["--stdio"],
      });
      expect(result.name).toBe("filesystem");
      expect((result as { command: string }).command).toBe("/path/to/server");
    });

    it("decodes http server", () => {
      const result = decode(AcpMcpServer)({
        type: "http",
        name: "api-server",
        url: "https://api.example.com/mcp",
        headers: [{ name: "Authorization", value: "Bearer token123" }],
      });
      expect(result.name).toBe("api-server");
      expect((result as { type: string }).type).toBe("http");
    });

    it("decodes sse server", () => {
      const result = decode(AcpMcpServer)({
        type: "sse",
        name: "event-stream",
        url: "https://events.example.com",
      });
      expect(result.name).toBe("event-stream");
      expect((result as { type: string }).type).toBe("sse");
    });

    it("decodes stdio server with env variables", () => {
      const result = decode(AcpMcpServer)({
        name: "secure-server",
        command: "/path/to/server",
        env: [{ name: "API_KEY", value: "secret123" }],
      });
      expect(result.name).toBe("secure-server");
    });
  });
});
