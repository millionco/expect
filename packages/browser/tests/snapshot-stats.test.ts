import { describe, expect, it } from "vite-plus/test";
import { computeSnapshotStats } from "../src/utils/snapshot-stats";
import type { RefMap } from "../src/types";

describe("computeSnapshotStats", () => {
  it("counts lines, characters, and estimated tokens", () => {
    const tree = '- button "Submit" [ref=e1]\n- heading "Title" [ref=e2]';
    const refs: RefMap = {
      e1: { role: "button", name: "Submit" },
      e2: { role: "heading", name: "Title" },
    };
    const stats = computeSnapshotStats(tree, refs);

    expect(stats.lines).toBe(2);
    expect(stats.characters).toBe(tree.length);
    expect(stats.estimatedTokens).toBe(Math.ceil(tree.length / 4));
  });

  it("counts interactive vs total refs", () => {
    const tree = '- button "Submit" [ref=e1]\n- heading "Title" [ref=e2]\n- link "Home" [ref=e3]';
    const refs: RefMap = {
      e1: { role: "button", name: "Submit" },
      e2: { role: "heading", name: "Title" },
      e3: { role: "link", name: "Home" },
    };
    const stats = computeSnapshotStats(tree, refs);

    expect(stats.totalRefs).toBe(3);
    expect(stats.interactiveRefs).toBe(2);
  });

  it("handles empty tree", () => {
    const stats = computeSnapshotStats("", {});

    expect(stats.lines).toBe(1);
    expect(stats.characters).toBe(0);
    expect(stats.estimatedTokens).toBe(0);
    expect(stats.totalRefs).toBe(0);
    expect(stats.interactiveRefs).toBe(0);
  });

  it("counts content roles as non-interactive", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "Click" },
      e2: { role: "article", name: "News" },
      e3: { role: "region", name: "Main" },
      e4: { role: "textbox", name: "Search" },
    };
    const stats = computeSnapshotStats("placeholder", refs);

    expect(stats.totalRefs).toBe(4);
    expect(stats.interactiveRefs).toBe(2);
  });
});
