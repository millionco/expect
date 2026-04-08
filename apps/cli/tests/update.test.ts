import { describe, expect, it } from "vite-plus/test";
import {
  buildExpectMcpServerConfig,
  formatExpectMcpVersion,
  getExpectMcpPackageSpecifier,
} from "../src/mcp/install-expect-mcp";

describe("update", () => {
  describe("getExpectMcpPackageSpecifier", () => {
    it("uses the latest release by default", () => {
      expect(getExpectMcpPackageSpecifier()).toBe("expect-cli@latest");
    });

    it("uses a specific version when provided", () => {
      expect(getExpectMcpPackageSpecifier("0.0.30")).toBe("expect-cli@0.0.30");
    });

    it("strips a leading v from semver versions", () => {
      expect(getExpectMcpPackageSpecifier("v0.0.30")).toBe("expect-cli@0.0.30");
    });
  });

  describe("formatExpectMcpVersion", () => {
    it("formats semver versions with a v prefix", () => {
      expect(formatExpectMcpVersion("0.0.30")).toBe("v0.0.30");
    });

    it("preserves dist-tags", () => {
      expect(formatExpectMcpVersion("canary")).toBe("canary");
    });
  });

  describe("buildExpectMcpServerConfig", () => {
    it("builds the default npx command", () => {
      expect(buildExpectMcpServerConfig()).toEqual({
        command: "npx",
        args: ["-y", "expect-cli@latest", "mcp"],
      });
    });

    it("pins the requested version", () => {
      expect(buildExpectMcpServerConfig("0.0.30")).toEqual({
        command: "npx",
        args: ["-y", "expect-cli@0.0.30", "mcp"],
      });
    });
  });
});
