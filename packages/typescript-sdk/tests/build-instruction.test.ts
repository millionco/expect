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
    const result = buildInstruction("http://localhost:3000/login", undefined, ["login works"]);
    expect(result).toContain("1. login works");
    expect(result).toContain("Navigate to http://localhost:3000/login");
  });

  it("numbers multiple tests", () => {
    const result = buildInstruction("http://localhost:3000", undefined, ["test one", "test two"]);
    expect(result).toContain("1. test one");
    expect(result).toContain("2. test two");
  });

  it("includes shared context as Context line", () => {
    const result = buildInstruction("http://localhost:3000", { email: "a@b.com" }, ["login"]);
    expect(result).toContain("Context:");
    expect(result).toContain("a@b.com");
  });

  it("includes string context as-is", () => {
    const result = buildInstruction("http://localhost:3000", "the app is in maintenance mode", [
      "shows banner",
    ]);
    expect(result).toContain("Context: the app is in maintenance mode");
  });

  it("uses per-test context over shared context", () => {
    const result = buildInstruction("http://localhost:3000", { shared: true }, [
      { title: "test one", context: { perTest: true } },
    ]);
    expect(result).toContain("perTest");
    expect(result).not.toContain("shared");
  });

  it("falls back to shared context when per-test context is undefined", () => {
    const result = buildInstruction("http://localhost:3000", { shared: true }, [
      { title: "test one" },
    ]);
    expect(result).toContain("shared");
  });

  it("omits Context line when no context at either level", () => {
    const result = buildInstruction("http://localhost:3000", undefined, ["test"]);
    expect(result).not.toContain("Context:");
  });

  it("handles mixed string and object tests", () => {
    const result = buildInstruction("http://localhost:3000", undefined, [
      "simple test",
      { title: "object test", context: "some context" },
    ]);
    expect(result).toContain("1. simple test");
    expect(result).toContain("2. object test");
    expect(result).toContain("Context: some context");
  });
});
