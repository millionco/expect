import { describe, expect, it } from "vitest";
import { PROFILE_BROWSER_CONFIGS } from "../src/profiles/constants.js";
import { browserDisplayNameToKey } from "../src/utils/browser-name-map.js";

describe("browserDisplayNameToKey", () => {
  it("maps Google Chrome to chrome", () => {
    expect(browserDisplayNameToKey("Google Chrome")).toBe("chrome");
  });

  it("maps Brave Browser to brave", () => {
    expect(browserDisplayNameToKey("Brave Browser")).toBe("brave");
  });

  it("maps Microsoft Edge to edge", () => {
    expect(browserDisplayNameToKey("Microsoft Edge")).toBe("edge");
  });

  it("maps Arc to arc", () => {
    expect(browserDisplayNameToKey("Arc")).toBe("arc");
  });

  it("maps every PROFILE_BROWSER_CONFIGS entry to a valid key", () => {
    for (const config of PROFILE_BROWSER_CONFIGS) {
      const browserKey = browserDisplayNameToKey(config.info.name);
      expect(browserKey).toBeDefined();
      expect(typeof browserKey).toBe("string");
      expect(browserKey!.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for unknown display names", () => {
    expect(browserDisplayNameToKey("Unknown Browser")).toBeUndefined();
    expect(browserDisplayNameToKey("")).toBeUndefined();
    expect(browserDisplayNameToKey("chrome")).toBeUndefined();
  });
});
