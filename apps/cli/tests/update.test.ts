import { describe, expect, it } from "vite-plus/test";
import { formatInstallCommand, getGlobalInstallCommand } from "../src/commands/update";

describe("update", () => {
  describe("getGlobalInstallCommand", () => {
    it("uses the latest npm release by default", () => {
      expect(getGlobalInstallCommand("npm")).toEqual({
        binary: "npm",
        args: ["install", "-g", "expect-cli@latest"],
      });
    });

    it("uses a specific version for pnpm", () => {
      expect(getGlobalInstallCommand("pnpm", "0.0.30")).toEqual({
        binary: "pnpm",
        args: ["add", "-g", "expect-cli@0.0.30"],
      });
    });

    it("strips a leading v from semver versions", () => {
      expect(getGlobalInstallCommand("bun", "v0.0.30")).toEqual({
        binary: "bun",
        args: ["add", "-g", "expect-cli@0.0.30"],
      });
    });

    it("uses the npm: prefix for deno installs", () => {
      expect(getGlobalInstallCommand("deno", "0.0.30")).toEqual({
        binary: "deno",
        args: ["install", "-g", "npm:expect-cli@0.0.30"],
      });
    });
  });

  describe("formatInstallCommand", () => {
    it("renders a copyable manual install command", () => {
      expect(
        formatInstallCommand({
          binary: "npm",
          args: ["install", "-g", "expect-cli@latest"],
        }),
      ).toBe("npm install -g expect-cli@latest");
    });
  });
});
