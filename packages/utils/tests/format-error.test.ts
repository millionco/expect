import { describe, expect, it } from "vite-plus/test";
import { formatError } from "../src/format-error";

describe("formatError", () => {
  it("extracts message from Error instances", () => {
    expect(formatError(new Error("something broke"))).toBe("something broke");
  });

  it("converts strings to themselves", () => {
    expect(formatError("raw string")).toBe("raw string");
  });

  it("converts numbers to string", () => {
    expect(formatError(42)).toBe("42");
  });

  it("converts null to string", () => {
    expect(formatError(null)).toBe("null");
  });

  it("converts undefined to string", () => {
    expect(formatError(undefined)).toBe("undefined");
  });

  it("converts objects to string", () => {
    expect(formatError({ code: 500 })).toBe("[object Object]");
  });

  it("handles Error subclasses", () => {
    expect(formatError(new TypeError("bad type"))).toBe("bad type");
    expect(formatError(new RangeError("out of range"))).toBe("out of range");
  });
});
