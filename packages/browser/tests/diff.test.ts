import { describe, expect, it } from "vite-plus/test";
import { diffSnapshots } from "../src/diff";

describe("diffSnapshots", () => {
  it("reports no changes for identical inputs", () => {
    const tree = '- button "Submit" [ref=e1]\n- link "Home" [ref=e2]';
    const result = diffSnapshots(tree, tree);

    expect(result.changed).toBe(false);
    expect(result.additions).toBe(0);
    expect(result.removals).toBe(0);
    expect(result.unchanged).toBe(2);
  });

  it("detects additions", () => {
    const before = '- button "Submit"';
    const after = '- button "Submit"\n- link "Home"';
    const result = diffSnapshots(before, after);

    expect(result.changed).toBe(true);
    expect(result.additions).toBe(1);
    expect(result.removals).toBe(0);
    expect(result.unchanged).toBe(1);
    expect(result.diff).toContain('+ - link "Home"');
  });

  it("detects removals", () => {
    const before = '- button "Submit"\n- link "Home"';
    const after = '- button "Submit"';
    const result = diffSnapshots(before, after);

    expect(result.changed).toBe(true);
    expect(result.additions).toBe(0);
    expect(result.removals).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(result.diff).toContain('- - link "Home"');
  });

  it("detects mixed changes", () => {
    const before = '- button "Submit"\n- link "Old"';
    const after = '- button "Submit"\n- link "New"';
    const result = diffSnapshots(before, after);

    expect(result.changed).toBe(true);
    expect(result.additions).toBe(1);
    expect(result.removals).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it("handles empty inputs", () => {
    const result = diffSnapshots("", "");

    expect(result.changed).toBe(false);
    expect(result.unchanged).toBe(1);
  });

  it("handles empty before with non-empty after", () => {
    const result = diffSnapshots("", '- button "New"');

    expect(result.changed).toBe(true);
    expect(result.additions).toBe(1);
    expect(result.removals).toBe(1);
  });

  it("produces correctly prefixed diff lines", () => {
    const before = "line1\nline2\nline3";
    const after = "line1\nmodified\nline3";
    const result = diffSnapshots(before, after);
    const lines = result.diff.split("\n");

    expect(lines[0]).toBe("  line1");
    expect(lines.some((line) => line.startsWith("- "))).toBe(true);
    expect(lines.some((line) => line.startsWith("+ "))).toBe(true);
    expect(lines[lines.length - 1]).toBe("  line3");
  });

  it("handles completely different content", () => {
    const before = "aaa\nbbb\nccc";
    const after = "xxx\nyyy\nzzz";
    const result = diffSnapshots(before, after);

    expect(result.changed).toBe(true);
    expect(result.removals).toBe(3);
    expect(result.additions).toBe(3);
    expect(result.unchanged).toBe(0);
  });
});
