import { describe, expect, it } from "vite-plus/test";
import { parseWatchAssessmentResponse } from "../src/watch";

describe("Watch", () => {
  describe("parseAssessmentResponse", () => {
    it("parses exact 'run'", () => {
      expect(parseWatchAssessmentResponse("run")).toBe("run");
    });

    it("parses exact 'skip'", () => {
      expect(parseWatchAssessmentResponse("skip")).toBe("skip");
    });

    it("parses 'run' with whitespace", () => {
      expect(parseWatchAssessmentResponse("  run  ")).toBe("run");
    });

    it("parses 'skip' with whitespace", () => {
      expect(parseWatchAssessmentResponse("\n skip \n")).toBe("skip");
    });

    it("parses 'Run' case-insensitive", () => {
      expect(parseWatchAssessmentResponse("Run")).toBe("run");
    });

    it("parses 'SKIP' case-insensitive", () => {
      expect(parseWatchAssessmentResponse("SKIP")).toBe("skip");
    });

    it("parses response starting with 'run'", () => {
      expect(parseWatchAssessmentResponse("run - changes affect UI")).toBe("run");
    });

    it("parses response starting with 'skip'", () => {
      expect(parseWatchAssessmentResponse("skip - only comments")).toBe("skip");
    });

    it("returns undefined for unparseable response", () => {
      expect(parseWatchAssessmentResponse("I think we should run tests")).toBeUndefined();
    });

    it("returns undefined for empty response", () => {
      expect(parseWatchAssessmentResponse("")).toBeUndefined();
    });
  });
});
