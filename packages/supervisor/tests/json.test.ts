import { describe, expect, it } from "vite-plus/test";
import { extractJsonObject } from "../src/json.js";

describe("extractJsonObject", () => {
  it("extracts JSON from a fenced code block", () => {
    const input = [
      "Here is your plan:",
      "```json",
      '{"title":"Plan","steps":[]}',
      "```",
      "Extra commentary after the block.",
    ].join("\n");

    expect(extractJsonObject(input)).toBe('{"title":"Plan","steps":[]}');
  });

  it("extracts the largest balanced object when multiple exist", () => {
    const input =
      '{"title":"Plan","message":"Use {braces} safely","steps":[]}\nAdditional notes {ignored}';

    expect(extractJsonObject(input)).toBe(
      '{"title":"Plan","message":"Use {braces} safely","steps":[]}',
    );
  });

  it("picks the plan over a small preceding json object", () => {
    const small = '{"type":"thinking"}';
    const large = '{"title":"Plan","rationale":"reason","steps":[{"id":"1"}]}';
    const input = `Here is my analysis: ${small}\n${large}`;

    expect(extractJsonObject(input)).toBe(large);
  });

  it("normalizes escaped json extracted from a fenced block", () => {
    const input = '```json\\n{\\n  \\"title\\": \\"Plan\\",\\n  \\"steps\\": []\\n}\\n```';

    expect(extractJsonObject(input)).toBe('{\n  "title": "Plan",\n  "steps": []\n}');
  });

  it("sanitizes invalid escape sequences so JSON.parse succeeds", () => {
    const input = '{"instruction":"Check the \\search field","valid":"line1\\nline2"}';
    const result = extractJsonObject(input);

    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({
      instruction: "Check the \\search field",
      valid: "line1\nline2",
    });
  });

  it("preserves valid unicode escape sequences", () => {
    const input = '{"emoji":"\\u2603"}';
    const result = extractJsonObject(input);

    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ emoji: "\u2603" });
  });

  it("sanitizes invalid unicode-like escape sequences", () => {
    const input = '{"text":"\\ugly"}';
    const result = extractJsonObject(input);

    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ text: "\\ugly" });
  });

  it("sanitizes multiple invalid escapes in a large json object", () => {
    const input =
      '{"steps":[{"instruction":"Navigate to \\dashboard","expectedOutcome":"\\page loads"}]}';
    const result = extractJsonObject(input);

    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.steps[0].instruction).toBe("Navigate to \\dashboard");
    expect(parsed.steps[0].expectedOutcome).toBe("\\page loads");
  });

  it("handles backslash at end of string value", () => {
    const input = '{"path":"trailing\\\\"}';
    const result = extractJsonObject(input);

    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ path: "trailing\\" });
  });
});
