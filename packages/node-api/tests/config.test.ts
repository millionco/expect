import { describe, expect, it, beforeEach } from "vite-plus/test";
import { configure, defineConfig, getGlobalConfig, resetGlobalConfig } from "../src/config";

describe("defineConfig", () => {
  it("returns the config object unchanged", () => {
    const config = {
      baseUrl: "http://localhost:3000",
      browser: "chromium" as const,
      isHeadless: true,
    };
    expect(defineConfig(config)).toStrictEqual(config);
  });

  it("returns the exact same reference", () => {
    const config = { baseUrl: "http://localhost:3000" };
    expect(defineConfig(config)).toBe(config);
  });
});

describe("configure / getGlobalConfig / resetGlobalConfig", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });

  it("starts with empty config", () => {
    expect(getGlobalConfig()).toStrictEqual({});
  });

  it("sets config values", () => {
    configure({ baseUrl: "http://localhost:3000" });
    expect(getGlobalConfig()).toStrictEqual({
      baseUrl: "http://localhost:3000",
    });
  });

  it("merges successive configure calls", () => {
    configure({ baseUrl: "http://localhost:3000" });
    configure({ isHeadless: false });
    expect(getGlobalConfig()).toStrictEqual({
      baseUrl: "http://localhost:3000",
      isHeadless: false,
    });
  });

  it("later values override earlier ones", () => {
    configure({ baseUrl: "http://localhost:3000" });
    configure({ baseUrl: "http://localhost:5000" });
    expect(getGlobalConfig().baseUrl).toBe("http://localhost:5000");
  });

  it("resetGlobalConfig clears all values", () => {
    configure({ baseUrl: "http://localhost:3000", timeout: 60000 });
    resetGlobalConfig();
    expect(getGlobalConfig()).toStrictEqual({});
  });
});
