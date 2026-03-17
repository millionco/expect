import { describe, it, expect } from "vite-plus/test";
import { compactTree } from "../src/utils/compact-tree";

describe("compactTree", () => {
  it("should return empty string for empty input", () => {
    expect(compactTree("")).toBe("");
  });

  it("should keep lines that contain a ref marker", () => {
    const tree = '- button "Submit" [ref=e1]';
    expect(compactTree(tree)).toBe(tree);
  });

  it("should keep lines with inline content (colon not at end)", () => {
    const tree = '- paragraph: "Hello world"';
    expect(compactTree(tree)).toBe(tree);
  });

  it("should remove structural nodes without ref-bearing descendants", () => {
    const tree = ["- navigation:", "  - list:", "    - listitem:"].join("\n");
    expect(compactTree(tree)).toBe("");
  });

  it("should keep structural parents that have ref-bearing children", () => {
    const tree = ["- navigation:", '  - link "Home" [ref=e1]', '  - link "About" [ref=e2]'].join(
      "\n",
    );

    const result = compactTree(tree);
    expect(result).toContain("navigation");
    expect(result).toContain("[ref=e1]");
    expect(result).toContain("[ref=e2]");
  });

  it("should keep deeply nested structural ancestors of ref nodes", () => {
    const tree = [
      "- navigation:",
      "  - list:",
      "    - listitem:",
      '      - link "Home" [ref=e1]',
    ].join("\n");

    const result = compactTree(tree);
    expect(result).toContain("navigation");
    expect(result).toContain("list");
    expect(result).toContain("listitem");
    expect(result).toContain("[ref=e1]");
  });

  it("should remove sibling branches without refs", () => {
    const tree = [
      "- navigation:",
      "  - list:",
      "    - listitem:",
      '      - link "Home" [ref=e1]',
      "- banner:",
      "  - paragraph:",
    ].join("\n");

    const result = compactTree(tree);
    expect(result).toContain("navigation");
    expect(result).toContain("[ref=e1]");
    expect(result).not.toContain("banner");
    expect(result).not.toContain("paragraph");
  });

  it("should keep multiple independent branches with refs", () => {
    const tree = [
      "- navigation:",
      '  - link "Nav" [ref=e1]',
      "- main:",
      '  - button "OK" [ref=e2]',
    ].join("\n");

    const result = compactTree(tree);
    expect(result).toContain("navigation");
    expect(result).toContain("[ref=e1]");
    expect(result).toContain("main");
    expect(result).toContain("[ref=e2]");
  });

  it("should handle mixed ref and non-ref children under the same parent", () => {
    const tree = [
      "- list:",
      "  - listitem:",
      '    - link "Active" [ref=e1]',
      "  - listitem:",
      "    - paragraph:",
    ].join("\n");

    const result = compactTree(tree);
    expect(result).toContain("list");
    expect(result).toContain("[ref=e1]");
  });

  it("should preserve a single ref-bearing line with no structure", () => {
    const tree = '- heading "Title" [ref=e1]';
    expect(compactTree(tree)).toBe(tree);
  });

  it("should handle tree with only structural nodes (all removed)", () => {
    const tree = ["- generic:", "  - group:", "    - generic:"].join("\n");
    expect(compactTree(tree)).toBe("");
  });

  it("should keep content lines alongside ref lines", () => {
    const tree = [
      '- heading "Title" [ref=e1]',
      '- paragraph: "Some descriptive text"',
      '- button "Submit" [ref=e2]',
    ].join("\n");

    const result = compactTree(tree);
    expect(result).toContain("heading");
    expect(result).toContain("paragraph");
    expect(result).toContain("button");
  });
});
