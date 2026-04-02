import { describe, expect, it } from "vite-plus/test";
import { buildInstruction, resolveUrl } from "../src/build-instruction";

describe("resolveUrl", () => {
  it("returns absolute http URL unchanged", () => {
    expect(resolveUrl("http://localhost:3000/login", undefined)).toBe(
      "http://localhost:3000/login",
    );
  });

  it("returns absolute https URL unchanged", () => {
    expect(resolveUrl("https://example.com/login", undefined)).toBe(
      "https://example.com/login",
    );
  });

  it("throws when relative URL has no baseUrl", () => {
    expect(() => resolveUrl("/login", undefined)).toThrow("No baseUrl configured");
  });

  it("error message includes Fix: with configure hint", () => {
    expect(() => resolveUrl("/login", undefined)).toThrow("Fix: configure(");
  });

  it("error message includes full URL alternative", () => {
    expect(() => resolveUrl("/login", undefined)).toThrow(
      'expect("http://localhost:3000/login")',
    );
  });

  it("resolves relative URL with leading slash against baseUrl", () => {
    expect(resolveUrl("/login", "http://localhost:3000")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("resolves relative URL without leading slash against baseUrl", () => {
    expect(resolveUrl("login", "http://localhost:3000")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("strips trailing slash from baseUrl", () => {
    expect(resolveUrl("/login", "http://localhost:3000/")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("ignores baseUrl when URL is absolute", () => {
    expect(resolveUrl("http://other.com/page", "http://localhost:3000")).toBe(
      "http://other.com/page",
    );
  });

  it("throws when url is not a string", () => {
    expect(() => resolveUrl(undefined as never, "http://localhost:3000")).toThrow(
      "Expected a URL string",
    );
  });
});

describe("buildInstruction", () => {
  it("builds instruction with a single string requirement", () => {
    const result = buildInstruction("http://localhost:3000/login", undefined, [
      "login form is visible",
    ]);
    expect(result).toContain("Navigate to http://localhost:3000/login");
    expect(result).toContain("1. login form is visible");
  });

  it("builds instruction with multiple string requirements", () => {
    const result = buildInstruction("http://localhost:3000/login", undefined, [
      "login form is visible",
      "forgot password link works",
    ]);
    expect(result).toContain("1. login form is visible");
    expect(result).toContain("2. forgot password link works");
  });

  it("includes target-level string data for string requirements", () => {
    const result = buildInstruction(
      "http://localhost:3000/login",
      "the app is in maintenance mode",
      ["shows maintenance banner"],
    );
    expect(result).toContain("Context: the app is in maintenance mode");
  });

  it("includes target-level object data formatted as JSON", () => {
    const result = buildInstruction(
      "http://localhost:3000/login",
      { email: "test@example.com" },
      ["login works"],
    );
    expect(result).toContain("Context:");
    expect(result).toContain('"email": "test@example.com"');
  });

  it("uses per-requirement data over target data", () => {
    const result = buildInstruction(
      "http://localhost:3000/login",
      { fallback: true },
      [
        {
          requirement: "login with specific creds",
          data: { email: "specific@example.com" },
        },
      ],
    );
    expect(result).toContain('"email": "specific@example.com"');
    expect(result).not.toContain("fallback");
  });

  it("falls back to target data when requirement has no data", () => {
    const result = buildInstruction(
      "http://localhost:3000/login",
      "shared context",
      [{ requirement: "check something", data: undefined as never }],
    );
    expect(result).toContain("1. check something");
  });

  it("omits context line when no data at either level", () => {
    const result = buildInstruction("http://localhost:3000/login", undefined, [
      "page loads",
    ]);
    expect(result).not.toContain("Context:");
  });

  it("handles mixed string and object requirements", () => {
    const result = buildInstruction("http://localhost:3000", undefined, [
      "page loads",
      { requirement: "form submits", data: { name: "test" } },
    ]);
    expect(result).toContain("1. page loads");
    expect(result).toContain("2. form submits");
    expect(result).toContain('"name": "test"');
  });
});
