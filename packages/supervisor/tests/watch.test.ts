import { describe, expect, it } from "vite-plus/test";
import { parseWatchDecision } from "../src/watch";

describe("Watch", () => {
  describe("parseWatchDecision", () => {
    it("parses exact 'run'", () => {
      expect(parseWatchDecision("run")).toBe("run");
    });

    it("parses exact 'skip'", () => {
      expect(parseWatchDecision("skip")).toBe("skip");
    });

    it("parses 'run' with whitespace", () => {
      expect(parseWatchDecision("  run  ")).toBe("run");
    });

    it("parses 'skip' with whitespace", () => {
      expect(parseWatchDecision("\n skip \n")).toBe("skip");
    });

    it("parses 'Run' case-insensitive", () => {
      expect(parseWatchDecision("Run")).toBe("run");
    });

    it("parses 'SKIP' case-insensitive", () => {
      expect(parseWatchDecision("SKIP")).toBe("skip");
    });

    it("parses response starting with 'run'", () => {
      expect(parseWatchDecision("run - changes affect UI")).toBe("run");
    });

    it("parses response starting with 'skip'", () => {
      expect(parseWatchDecision("skip - only comments")).toBe("skip");
    });

    it("returns undefined for unparseable response", () => {
      expect(parseWatchDecision("I think we should run tests")).toBeUndefined();
    });

    it("returns undefined for empty response", () => {
      expect(parseWatchDecision("")).toBeUndefined();
    });
  });
});
