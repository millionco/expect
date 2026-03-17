import { describe, it, expect } from "vite-plus/test";
import { resolveNthDuplicates } from "../src/utils/resolve-nth-duplicates";
import type { RefMap } from "../src/types";

describe("resolveNthDuplicates", () => {
  it("should not modify empty refs", () => {
    const refs: RefMap = {};
    resolveNthDuplicates(refs);
    expect(refs).toEqual({});
  });

  it("should not set nth for unique role+name entries", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "OK" },
      e2: { role: "button", name: "Cancel" },
      e3: { role: "link", name: "Home" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBeUndefined();
    expect(refs.e2.nth).toBeUndefined();
    expect(refs.e3.nth).toBeUndefined();
  });

  it("should set nth for two duplicate role+name entries", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "OK" },
      e2: { role: "button", name: "OK" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBe(0);
    expect(refs.e2.nth).toBe(1);
  });

  it("should set nth for three or more duplicates", () => {
    const refs: RefMap = {
      e1: { role: "link", name: "Read more" },
      e2: { role: "link", name: "Read more" },
      e3: { role: "link", name: "Read more" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBe(0);
    expect(refs.e2.nth).toBe(1);
    expect(refs.e3.nth).toBe(2);
  });

  it("should handle multiple groups of duplicates independently", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "OK" },
      e2: { role: "button", name: "OK" },
      e3: { role: "link", name: "More" },
      e4: { role: "link", name: "More" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBe(0);
    expect(refs.e2.nth).toBe(1);
    expect(refs.e3.nth).toBe(0);
    expect(refs.e4.nth).toBe(1);
  });

  it("should not consider same name with different roles as duplicates", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "Submit" },
      e2: { role: "link", name: "Submit" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBeUndefined();
    expect(refs.e2.nth).toBeUndefined();
  });

  it("should not consider same role with different names as duplicates", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "OK" },
      e2: { role: "button", name: "Cancel" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBeUndefined();
    expect(refs.e2.nth).toBeUndefined();
  });

  it("should handle duplicates with empty names", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "" },
      e2: { role: "button", name: "" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBe(0);
    expect(refs.e2.nth).toBe(1);
  });

  it("should handle a mix of unique and duplicate entries", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "OK" },
      e2: { role: "heading", name: "Title" },
      e3: { role: "button", name: "OK" },
      e4: { role: "link", name: "Home" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBe(0);
    expect(refs.e2.nth).toBeUndefined();
    expect(refs.e3.nth).toBe(1);
    expect(refs.e4.nth).toBeUndefined();
  });

  it("should handle a single entry", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "Solo" },
    };
    resolveNthDuplicates(refs);

    expect(refs.e1.nth).toBeUndefined();
  });
});
