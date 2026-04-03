import { describe, it, expect } from "vite-plus/test";
import { resolveUrl, buildInstruction } from "../src/build-instruction";

describe("resolveUrl", () => {
  it("passes through absolute http URLs", () => {
    expect(resolveUrl("http://localhost:3000/login", undefined)).toBe(
      "http://localhost:3000/login",
    );
  });

  it("passes through absolute https URLs", () => {
    expect(resolveUrl("https://example.com/page", undefined)).toBe("https://example.com/page");
  });

  it("resolves relative URL against baseUrl", () => {
    expect(resolveUrl("/login", "http://localhost:3000")).toBe("http://localhost:3000/login");
  });

  it("resolves relative URL without leading slash", () => {
    expect(resolveUrl("login", "http://localhost:3000")).toBe("http://localhost:3000/login");
  });

  it("strips trailing slash from baseUrl", () => {
    expect(resolveUrl("/login", "http://localhost:3000/")).toBe("http://localhost:3000/login");
  });

  it("ignores baseUrl for absolute URLs", () => {
    expect(resolveUrl("http://other.com/page", "http://localhost:3000")).toBe(
      "http://other.com/page",
    );
  });

  it("throws for non-string URL", () => {
    expect(() => resolveUrl(undefined, undefined)).toThrow("Expected a URL string");
  });

  it("throws for relative URL without baseUrl", () => {
    expect(() => resolveUrl("/login", undefined)).toThrow("No baseUrl configured");
  });

  it("includes Fix line in error", () => {
    try {
      resolveUrl("/login", undefined);
    } catch (error) {
      expect((error as Error).message).toContain("Fix:");
    }
  });
});

describe("buildInstruction", () => {
  it("builds single test", () => {
    const result = buildInstruction("http://localhost:3000/login", ["login works"]);
    expect(result).toContain("1. login works");
    expect(result).toContain("Navigate to http://localhost:3000/login");
  });

  it("numbers multiple tests", () => {
    const result = buildInstruction("http://localhost:3000", ["test one", "test two"]);
    expect(result).toContain("1. test one");
    expect(result).toContain("2. test two");
  });
});
