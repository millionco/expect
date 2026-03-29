import { describe, expect, it } from "vite-plus/test";
import { parseAssessmentResponse } from "../src/watch";

describe("Watch", () => {
  describe("parseAssessmentResponse", () => {
    it("parses exact 'run'", () => {
      expect(parseAssessmentResponse("run")).toBe("run");
    });

    it("parses exact 'skip'", () => {
      expect(parseAssessmentResponse("skip")).toBe("skip");
    });

    it("parses 'run' with whitespace", () => {
      expect(parseAssessmentResponse("  run  ")).toBe("run");
    });

    it("parses 'skip' with whitespace", () => {
      expect(parseAssessmentResponse("\n skip \n")).toBe("skip");
    });

    it("parses 'Run' case-insensitive", () => {
      expect(parseAssessmentResponse("Run")).toBe("run");
    });

    it("parses 'SKIP' case-insensitive", () => {
      expect(parseAssessmentResponse("SKIP")).toBe("skip");
    });

    it("parses response starting with 'run'", () => {
      expect(parseAssessmentResponse("run - changes affect UI")).toBe("run");
    });

    it("parses response starting with 'skip'", () => {
      expect(parseAssessmentResponse("skip - only comments")).toBe("skip");
    });

    it("returns undefined for unparseable response", () => {
      expect(parseAssessmentResponse("I think we should run tests")).toBeUndefined();
    });

    it("returns undefined for empty response", () => {
      expect(parseAssessmentResponse("")).toBeUndefined();
    });
  });
});
