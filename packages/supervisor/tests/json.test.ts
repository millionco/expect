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
});
