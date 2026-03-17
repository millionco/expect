import { describe, it, expect } from "vite-plus/test";
import { toActionError } from "../src/utils/action-error";

describe("toActionError", () => {
  describe("RefAmbiguousError", () => {
    it("matches strict mode violation with element count", () => {
      const error = new Error(
        "strict mode violation: locator('button') resolved to 3 elements:\n    ...",
      );
      const result = toActionError(error, "e1");
      expect(result._tag).toBe("RefAmbiguousError");
      expect(result.ref).toBe("e1");
      if (result._tag === "RefAmbiguousError") {
        expect(result.matchCount).toBe("3");
      }
    });

    it("falls back to 'multiple' when count is missing", () => {
      const error = new Error("strict mode violation");
      const result = toActionError(error, "e1");
      expect(result._tag).toBe("RefAmbiguousError");
      if (result._tag === "RefAmbiguousError") {
        expect(result.matchCount).toBe("multiple");
      }
    });
  });

  describe("RefBlockedError", () => {
    it("matches '{desc} intercepts pointer events'", () => {
      const error = new Error('<div class="overlay">overlay</div> intercepts pointer events');
      const result = toActionError(error, "e2");
      expect(result._tag).toBe("RefBlockedError");
      expect(result.ref).toBe("e2");
    });
  });

  describe("RefNotVisibleError", () => {
    it("matches 'Element is not visible' (NonRecoverableDOMError)", () => {
      const result = toActionError(new Error("Element is not visible"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'Element is outside of the viewport'", () => {
      const result = toActionError(new Error("Element is outside of the viewport"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'Element is not stable'", () => {
      const result = toActionError(new Error("Element is not stable"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches progress log 'element is not visible'", () => {
      const result = toActionError(new Error("element is not visible"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches call log 'to be visible' from timeout", () => {
      const error = new Error(
        "Timeout 30000ms exceeded.\nCall log:\n  waiting for locator('button') to be visible",
      );
      const result = toActionError(error, "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'Element(s) not found'", () => {
      const result = toActionError(new Error("Element(s) not found"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'Element is not attached to the DOM'", () => {
      const result = toActionError(new Error("Element is not attached to the DOM"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'Element is not connected'", () => {
      const result = toActionError(new Error("Element is not connected"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'No element matching {sel}'", () => {
      const result = toActionError(new Error("No element matching #foo"), "e3");
      expect(result._tag).toBe("RefNotVisibleError");
    });

    it("matches 'Failed to find element matching selector'", () => {
      const result = toActionError(
        new Error('Failed to find element matching selector "#foo"'),
        "e3",
      );
      expect(result._tag).toBe("RefNotVisibleError");
    });
  });

  describe("ActionTimeoutError", () => {
    it("matches 'Timeout {N}ms exceeded.'", () => {
      const result = toActionError(new Error("Timeout 30000ms exceeded."), "e4");
      expect(result._tag).toBe("ActionTimeoutError");
      expect(result.ref).toBe("e4");
    });

    it("matches timeout with call log (no visibility mention)", () => {
      const error = new Error(
        "Timeout 5000ms exceeded.\nCall log:\n  waiting for locator('button')",
      );
      const result = toActionError(error, "e4");
      expect(result._tag).toBe("ActionTimeoutError");
    });
  });

  describe("fallback", () => {
    it("returns ActionUnknownError for unrecognized errors", () => {
      const result = toActionError(new Error("something unknown"), "e5");
      expect(result._tag).toBe("ActionUnknownError");
    });

    it("handles non-Error values", () => {
      const result = toActionError("raw string error", "e5");
      expect(result._tag).toBe("ActionUnknownError");
      expect(result.ref).toBe("e5");
    });
  });

  it("preserves the ref in all error types", () => {
    const cases = [
      new Error("strict mode violation: locator('a') resolved to 2 elements"),
      new Error("overlay intercepts pointer events"),
      new Error("Element is not visible"),
      new Error("Element(s) not found"),
      new Error("Timeout 5000ms exceeded."),
      new Error("something unknown"),
    ];
    for (const error of cases) {
      const result = toActionError(error, "e6");
      expect(result.ref).toBe("e6");
    }
  });
});
