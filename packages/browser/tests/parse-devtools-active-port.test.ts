import { describe, expect, it } from "vite-plus/test";
import { parseDevToolsActivePort } from "../src/utils/parse-devtools-active-port";

describe("parseDevToolsActivePort", () => {
  it("parses a valid DevToolsActivePort with port and path", () => {
    const result = parseDevToolsActivePort("9222\n/devtools/browser/abc-123\n");

    expect(result).toEqual({ port: 9222, wsPath: "/devtools/browser/abc-123" });
  });

  it("defaults wsPath when only port line is present", () => {
    const result = parseDevToolsActivePort("9222\n");

    expect(result).toEqual({ port: 9222, wsPath: "/devtools/browser" });
  });

  it("handles port-only content with no trailing newline", () => {
    const result = parseDevToolsActivePort("9222");

    expect(result).toEqual({ port: 9222, wsPath: "/devtools/browser" });
  });

  it("trims whitespace around port and path", () => {
    const result = parseDevToolsActivePort("  9222  \n  /devtools/browser/xyz  \n");

    expect(result).toEqual({ port: 9222, wsPath: "/devtools/browser/xyz" });
  });

  it("returns undefined for empty content", () => {
    expect(parseDevToolsActivePort("")).toBeUndefined();
    expect(parseDevToolsActivePort("   ")).toBeUndefined();
    expect(parseDevToolsActivePort("\n")).toBeUndefined();
  });

  it("returns undefined for non-numeric port", () => {
    expect(parseDevToolsActivePort("abc\n/devtools/browser/123")).toBeUndefined();
  });

  it("parses high port numbers", () => {
    const result = parseDevToolsActivePort("49152\n/devtools/browser/uuid");

    expect(result).toEqual({ port: 49152, wsPath: "/devtools/browser/uuid" });
  });
});
