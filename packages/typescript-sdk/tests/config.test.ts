import { describe, it, expect, beforeEach } from "vite-plus/test";
import { defineConfig, configure, getGlobalConfig, resetGlobalConfig } from "../src/config";

describe("defineConfig", () => {
  it("returns the same reference", () => {
    const config = { baseUrl: "http://localhost:3000" };
    expect(defineConfig(config)).toBe(config);
  });
});

describe("configure", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });

  it("merges into global config", () => {
    configure({ baseUrl: "http://localhost:3000" });
    expect(getGlobalConfig().baseUrl).toBe("http://localhost:3000");
  });

  it("merges successive calls", () => {
    configure({ baseUrl: "http://localhost:3000" });
    configure({ mode: "headed" });
    const config = getGlobalConfig();
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.mode).toBe("headed");
  });

  it("later values override earlier ones", () => {
    configure({ baseUrl: "http://localhost:3000" });
    configure({ baseUrl: "http://localhost:4000" });
    expect(getGlobalConfig().baseUrl).toBe("http://localhost:4000");
  });
});

describe("resetGlobalConfig", () => {
  it("clears all values", () => {
    configure({ baseUrl: "http://localhost:3000", mode: "headed" });
    resetGlobalConfig();
    const config = getGlobalConfig();
    expect(config.baseUrl).toBeUndefined();
    expect(config.mode).toBeUndefined();
  });
});
