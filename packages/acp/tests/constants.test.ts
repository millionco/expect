import { describe, expect, it } from "vite-plus/test";
import {
  PROTOCOL_VERSION,
  JSON_RPC_VERSION,
  ERROR_CODE_PARSE,
  ERROR_CODE_INVALID_REQUEST,
  ERROR_CODE_METHOD_NOT_FOUND,
  ERROR_CODE_INVALID_PARAMS,
  ERROR_CODE_INTERNAL,
  ERROR_CODE_AUTH_REQUIRED,
  ERROR_CODE_NOT_FOUND,
} from "../src/constants.js";

describe("ACP Constants", () => {
  it("protocol version is a positive integer", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  });

  it("JSON-RPC version is 2.0", () => {
    expect(JSON_RPC_VERSION).toBe("2.0");
  });

  it("error codes follow JSON-RPC spec ranges", () => {
    expect(ERROR_CODE_PARSE).toBe(-32700);
    expect(ERROR_CODE_INVALID_REQUEST).toBe(-32600);
    expect(ERROR_CODE_METHOD_NOT_FOUND).toBe(-32601);
    expect(ERROR_CODE_INVALID_PARAMS).toBe(-32602);
    expect(ERROR_CODE_INTERNAL).toBe(-32603);
    expect(ERROR_CODE_AUTH_REQUIRED).toBe(-32000);
    expect(ERROR_CODE_NOT_FOUND).toBe(-32001);
  });
});
