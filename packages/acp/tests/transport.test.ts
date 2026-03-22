import { describe, expect, it } from "vite-plus/test";
import { JSON_RPC_VERSION } from "../src/constants.js";

describe("JSON-RPC message format", () => {
  it("request has correct shape", () => {
    const request = {
      jsonrpc: JSON_RPC_VERSION,
      id: 1,
      method: "initialize",
      params: { protocolVersion: 1 },
    };
    expect(request.jsonrpc).toBe("2.0");
    expect(request.id).toBe(1);
    expect(request.method).toBe("initialize");
  });

  it("response has correct shape", () => {
    const response = {
      jsonrpc: JSON_RPC_VERSION,
      id: 1,
      result: { protocolVersion: 1, agentCapabilities: {} },
    };
    expect(response.jsonrpc).toBe("2.0");
    expect(response.result).toBeDefined();
  });

  it("error response has correct shape", () => {
    const errorResponse = {
      jsonrpc: JSON_RPC_VERSION,
      id: 1,
      error: { code: -32601, message: "Method not found" },
    };
    expect(errorResponse.error.code).toBe(-32601);
    expect(errorResponse.error.message).toBe("Method not found");
  });

  it("notification omits id", () => {
    const notification = {
      jsonrpc: JSON_RPC_VERSION,
      method: "session/update",
      params: { sessionId: "sess_1", update: { sessionUpdate: "agent_message_chunk" } },
    };
    expect("id" in notification).toBe(false);
    expect(notification.method).toBe("session/update");
  });

  it("messages serialize to single-line JSON", () => {
    const message = {
      jsonrpc: JSON_RPC_VERSION,
      id: 1,
      method: "session/prompt",
      params: { sessionId: "sess_1", prompt: [{ type: "text", text: "hello\nworld" }] },
    };
    const serialized = JSON.stringify(message);
    expect(serialized).not.toContain("\n");
    const parsed = JSON.parse(serialized);
    expect(parsed.params.prompt[0].text).toBe("hello\nworld");
  });
});
