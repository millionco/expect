import { describe, it, expect } from "vite-plus/test";
import { getIndentLevel } from "../src/utils/get-indent-level";

describe("getIndentLevel", () => {
  it("should return 0 for no indentation", () => {
    expect(getIndentLevel("- button")).toBe(0);
  });

  it("should return 1 for 2 spaces", () => {
    expect(getIndentLevel("  - link")).toBe(1);
  });

  it("should return 2 for 4 spaces", () => {
    expect(getIndentLevel("    - heading")).toBe(2);
  });

  it("should return 3 for 6 spaces", () => {
    expect(getIndentLevel("      - paragraph")).toBe(3);
  });

  it("should floor odd space counts", () => {
    expect(getIndentLevel(" - button")).toBe(0);
    expect(getIndentLevel("   - button")).toBe(1);
    expect(getIndentLevel("     - button")).toBe(2);
  });

  it("should return 0 for an empty string", () => {
    expect(getIndentLevel("")).toBe(0);
  });

  it("should return 0 for a string with no leading whitespace", () => {
    expect(getIndentLevel("hello")).toBe(0);
  });

  it("should count only leading whitespace, not trailing", () => {
    expect(getIndentLevel("  - button   ")).toBe(1);
  });

  it("should handle a whitespace-only string", () => {
    expect(getIndentLevel("        ")).toBe(4);
  });

  it("should handle deeply nested indentation", () => {
    expect(getIndentLevel("                    - deep")).toBe(10);
  });
});
