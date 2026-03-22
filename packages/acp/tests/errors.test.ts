import { describe, expect, it } from "vite-plus/test";
import { AcpClientError, JsonRpcParseError, TransportClosedError } from "../src/errors.js";

describe("ACP Errors", () => {
  describe("AcpClientError", () => {
    it("formats message from cause", () => {
      const error = new AcpClientError({ cause: "connection refused" });
      expect(error.message).toContain("connection refused");
      expect(error._tag).toBe("AcpClientError");
    });
  });

  describe("JsonRpcParseError", () => {
    it("formats message from cause", () => {
      const error = new JsonRpcParseError({ cause: "unexpected EOF" });
      expect(error.message).toContain("unexpected EOF");
      expect(error._tag).toBe("AcpJsonRpcParseError");
    });
  });

  describe("TransportClosedError", () => {
    it("has descriptive message", () => {
      const error = new TransportClosedError({});
      expect(error.message).toContain("closed");
      expect(error._tag).toBe("AcpTransportClosedError");
    });
  });
});
