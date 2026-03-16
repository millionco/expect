import { Option } from "effect";
import { describe, it, expect } from "vitest";
import { parseAriaLine } from "../src/utils/parse-aria-line";

describe("parseAriaLine", () => {
  it("should parse a role with a quoted name", () => {
    const result = parseAriaLine('- button "Submit"');
    expect(result).toEqual(Option.some({ role: "button", name: "Submit" }));
  });

  it("should parse a role without a name", () => {
    const result = parseAriaLine("- paragraph:");
    expect(result).toEqual(Option.some({ role: "paragraph", name: "" }));
  });

  it("should parse indented lines", () => {
    const result = parseAriaLine('    - link "Click me"');
    expect(result).toEqual(Option.some({ role: "link", name: "Click me" }));
  });

  it("should return None for text role", () => {
    expect(Option.isNone(parseAriaLine("- text: hello world"))).toBe(true);
  });

  it("should return None for non-matching lines", () => {
    expect(Option.isNone(parseAriaLine("just some text"))).toBe(true);
    expect(Option.isNone(parseAriaLine(""))).toBe(true);
    expect(Option.isNone(parseAriaLine("  /url: https://example.com"))).toBe(true);
  });

  it("should handle names with special characters", () => {
    const result = parseAriaLine('- heading "Hello & Goodbye"');
    expect(result).toEqual(Option.some({ role: "heading", name: "Hello & Goodbye" }));
  });

  it("should handle empty quoted name", () => {
    const result = parseAriaLine('- button ""');
    expect(result).toEqual(Option.some({ role: "button", name: "" }));
  });

  it("should handle escaped quotes in name", () => {
    const result = parseAriaLine('- button "Say \\"hello\\""');
    expect(result).toEqual(Option.some({ role: "button", name: 'Say "hello"' }));
  });

  it("should handle escaped backslash in name", () => {
    const result = parseAriaLine('- button "path\\\\to\\\\file"');
    expect(result).toEqual(Option.some({ role: "button", name: "path\\to\\file" }));
  });

  it("should handle name with mixed escapes", () => {
    const result = parseAriaLine('- link "Click \\"here\\" for C:\\\\docs"');
    expect(result).toEqual(Option.some({ role: "link", name: 'Click "here" for C:\\docs' }));
  });
});
