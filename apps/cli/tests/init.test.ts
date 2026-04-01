import { describe, expect, it, beforeEach, afterEach } from "vite-plus/test";
import { detectPackageManager } from "../src/commands/init-utils";

describe("init", () => {
  describe("detectPackageManager", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.VITE_PLUS_CLI_BIN;
      delete process.env.npm_config_user_agent;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("detects vp from VITE_PLUS_CLI_BIN", () => {
      process.env.VITE_PLUS_CLI_BIN = "/usr/local/bin/vp";
      expect(detectPackageManager()).toBe("vp");
    });

    it("prioritizes vp over npm_config_user_agent", () => {
      process.env.VITE_PLUS_CLI_BIN = "/usr/local/bin/vp";
      process.env.npm_config_user_agent = "npm/10.0.0 node/v20.0.0";
      expect(detectPackageManager()).toBe("vp");
    });

    it("detects npm from user agent", () => {
      process.env.npm_config_user_agent = "npm/10.0.0 node/v20.0.0";
      expect(detectPackageManager()).toBe("npm");
    });

    it("detects pnpm from user agent", () => {
      process.env.npm_config_user_agent = "pnpm/8.15.0 node/v20.0.0";
      expect(detectPackageManager()).toBe("pnpm");
    });

    it("detects yarn from user agent", () => {
      process.env.npm_config_user_agent = "yarn/4.0.0 node/v20.0.0";
      expect(detectPackageManager()).toBe("yarn");
    });

    it("detects bun from user agent", () => {
      process.env.npm_config_user_agent = "bun/1.0.0 node/v20.0.0";
      expect(detectPackageManager()).toBe("bun");
    });

    it("falls back to npm when no env vars set", () => {
      expect(detectPackageManager()).toBe("npm");
    });
  });
});
