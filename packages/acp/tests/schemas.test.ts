import { describe, expect, it } from "vite-plus/test";
import { Option, Schema } from "effect";
import {
  SessionId,
  ToolCallId,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  PlanEntry,
  SessionModeState,
  Implementation,
} from "../src/schemas.js";
import { PROTOCOL_VERSION } from "../src/constants.js";

describe("ACP Schemas", () => {
  describe("branded IDs", () => {
    it("creates SessionId from string", () => {
      const sessionId = SessionId.makeUnsafe("sess_abc123");
      expect(sessionId).toBe("sess_abc123");
    });

    it("creates ToolCallId from string", () => {
      const toolCallId = ToolCallId.makeUnsafe("tc_xyz");
      expect(toolCallId).toBe("tc_xyz");
    });
  });

  describe("InitializeRequest", () => {
    it("decodes a valid initialize request", () => {
      const decoded = Schema.decodeUnknownSync(InitializeRequest)({ protocolVersion: 1 });
      expect(decoded.protocolVersion).toBe(1);
    });

    it("decodes with client capabilities", () => {
      const input = {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: false },
          terminal: true,
        },
        clientInfo: { name: "test-client", version: "1.0.0" },
      };
      const decoded = Schema.decodeUnknownSync(InitializeRequest)(input);
      expect(decoded.clientCapabilities?.fs?.readTextFile).toBe(true);
      expect(decoded.clientCapabilities?.terminal).toBe(true);
    });
  });

  describe("InitializeResponse", () => {
    it("decodes a valid initialize response", () => {
      const input = {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: false },
        agentInfo: { name: "testie", title: "Testie", version: "0.0.1" },
        authMethods: [],
      };
      const decoded = Schema.decodeUnknownSync(InitializeResponse)(input);
      expect(decoded.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(decoded.agentCapabilities?.loadSession).toBe(false);
    });
  });

  describe("NewSessionRequest", () => {
    it("decodes with cwd", () => {
      const input = { cwd: "/home/user/project", mcpServers: [] };
      const decoded = Schema.decodeUnknownSync(NewSessionRequest)(input);
      expect(Option.getOrElse(decoded.cwd, () => "")).toBe("/home/user/project");
    });

    it("decodes without cwd", () => {
      const decoded = Schema.decodeUnknownSync(NewSessionRequest)({});
      expect(Option.isNone(decoded.cwd)).toBe(true);
    });
  });

  describe("NewSessionResponse", () => {
    it("decodes a session response", () => {
      const decoded = Schema.decodeUnknownSync(NewSessionResponse)({ sessionId: "sess_123" });
      expect(decoded.sessionId).toBe("sess_123");
    });
  });

  describe("PromptRequest", () => {
    it("decodes a text prompt", () => {
      const input = {
        sessionId: "sess_123",
        prompt: [{ type: "text", text: "hello world" }],
      };
      const decoded = Schema.decodeUnknownSync(PromptRequest)(input);
      expect(decoded.sessionId).toBe("sess_123");
      expect(decoded.prompt).toHaveLength(1);
      expect(decoded.prompt[0].type).toBe("text");
    });

    it("decodes multi-content prompt", () => {
      const input = {
        sessionId: "sess_123",
        prompt: [
          { type: "text", text: "analyze this" },
          {
            type: "resource_link",
            uri: "file:///project/main.ts",
            name: "main.ts",
          },
        ],
      };
      const decoded = Schema.decodeUnknownSync(PromptRequest)(input);
      expect(decoded.prompt).toHaveLength(2);
    });
  });

  describe("PromptResponse", () => {
    it("decodes end_turn", () => {
      const decoded = Schema.decodeUnknownSync(PromptResponse)({ stopReason: "end_turn" });
      expect(decoded.stopReason).toBe("end_turn");
    });

    it("decodes cancelled", () => {
      const decoded = Schema.decodeUnknownSync(PromptResponse)({ stopReason: "cancelled" });
      expect(decoded.stopReason).toBe("cancelled");
    });

    it("rejects invalid stop reason", () => {
      expect(() => Schema.decodeUnknownSync(PromptResponse)({ stopReason: "invalid" })).toThrow();
    });
  });

  describe("CancelNotification", () => {
    it("decodes a cancel", () => {
      const decoded = Schema.decodeUnknownSync(CancelNotification)({
        sessionId: "sess_abc",
      });
      expect(decoded.sessionId).toBe("sess_abc");
    });
  });

  describe("PlanEntry", () => {
    it("decodes a plan entry", () => {
      const input = { content: "Check syntax", priority: "high", status: "pending" };
      const decoded = Schema.decodeUnknownSync(PlanEntry)(input);
      expect(decoded.content).toBe("Check syntax");
      expect(decoded.priority).toBe("high");
      expect(decoded.status).toBe("pending");
    });

    it("rejects invalid priority", () => {
      expect(() =>
        Schema.decodeUnknownSync(PlanEntry)({
          content: "x",
          priority: "urgent",
          status: "pending",
        }),
      ).toThrow();
    });
  });

  describe("SessionModeState", () => {
    it("decodes mode state with modes", () => {
      const input = {
        currentModeId: "test",
        availableModes: [
          { id: "test", name: "Test" },
          { id: "plan", name: "Plan Only", description: "Generate without executing" },
        ],
      };
      const decoded = Schema.decodeUnknownSync(SessionModeState)(input);
      expect(decoded.currentModeId).toBe("test");
      expect(decoded.availableModes).toHaveLength(2);
      expect(Option.isSome(decoded.availableModes[1].description)).toBe(true);
    });
  });

  describe("Implementation", () => {
    it("decodes with all fields", () => {
      const decoded = Schema.decodeUnknownSync(Implementation)({
        name: "testie",
        title: "Testie",
        version: "0.0.1",
      });
      expect(decoded.name).toBe("testie");
      expect(Option.getOrElse(decoded.title, () => "")).toBe("Testie");
    });

    it("decodes with only name", () => {
      const decoded = Schema.decodeUnknownSync(Implementation)({ name: "testie" });
      expect(decoded.name).toBe("testie");
      expect(Option.isNone(decoded.title)).toBe(true);
    });
  });
});
