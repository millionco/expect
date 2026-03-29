import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { runInit } from "../src/commands/init";
import { detectPackageManager } from "../src/commands/init-utils";

const succeedSpy = vi.fn();
const failSpy = vi.fn();
const mockDetectAvailableAgents = vi.fn();
const mockTryRun = vi.fn();
const mockRunAddSkill = vi.fn();
const mockRunAddGithubAction = vi.fn();

vi.mock("@expect/agent", () => ({
  detectAvailableAgents: (...args: unknown[]) => mockDetectAvailableAgents(...args),
}));

vi.mock("../src/constants", () => ({
  VERSION: "0.0.15",
}));

vi.mock("../src/commands/init-utils", async () => {
  const actual = await vi.importActual<typeof import("../src/commands/init-utils")>(
    "../src/commands/init-utils",
  );

  return {
    ...actual,
    tryRun: (...args: unknown[]) => mockTryRun(...args),
  };
});

vi.mock("../src/commands/add-skill", () => ({
  runAddSkill: (...args: unknown[]) => mockRunAddSkill(...args),
}));

vi.mock("../src/commands/add-github-action", () => ({
  runAddGithubAction: (...args: unknown[]) => mockRunAddGithubAction(...args),
}));

vi.mock("../src/utils/spinner", () => ({
  spinner: () => ({
    start: () => ({
      succeed: succeedSpy,
      fail: failSpy,
    }),
  }),
}));

vi.mock("../src/utils/prompts", () => ({
  prompts: vi.fn().mockResolvedValue({ setupGithubAction: true }),
}));

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

  describe("runInit", () => {
    const originalEnv = process.env;
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code ?? ""}`) as never;
      });

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.VITE_PLUS_CLI_BIN;
      delete process.env.npm_config_user_agent;
      vi.clearAllMocks();
      mockDetectAvailableAgents.mockReturnValue(["claude"]);
      mockTryRun.mockResolvedValue(true);
      mockRunAddSkill.mockResolvedValue(undefined);
      mockRunAddGithubAction.mockResolvedValue(undefined);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("exits with error when no agents are detected", async () => {
      mockDetectAvailableAgents.mockReturnValue([]);

      await expect(runInit({ yes: true })).rejects.toThrow("process.exit:1");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockRunAddSkill).not.toHaveBeenCalled();
      expect(mockRunAddGithubAction).not.toHaveBeenCalled();
    });

    it("proceeds when at least one agent is detected", async () => {
      await runInit({ yes: true });

      expect(exitSpy).not.toHaveBeenCalled();
      expect(mockRunAddSkill).toHaveBeenCalledWith({ yes: true });
      expect(mockRunAddGithubAction).toHaveBeenCalledWith({
        yes: true,
        agent: undefined,
        availableAgents: ["claude"],
      });
    });

    it("global install command uses the detected package manager binary", async () => {
      process.env.npm_config_user_agent = "pnpm/8.15.0 node/v20.0.0";

      await runInit({ yes: true });

      expect(mockTryRun).toHaveBeenCalledWith("pnpm add -g expect-cli@latest");
    });

    it("uses vp binary when VITE_PLUS_CLI_BIN is set", async () => {
      process.env.VITE_PLUS_CLI_BIN = "/usr/local/bin/vp";

      await runInit({ yes: true });

      expect(mockTryRun).toHaveBeenCalledWith("vp install -g expect-cli@latest");
    });

    it("continues to skill install even when global install fails", async () => {
      mockTryRun.mockResolvedValueOnce(false);

      await runInit({ yes: true });

      expect(mockRunAddSkill).toHaveBeenCalledWith({ yes: true });
      expect(mockRunAddGithubAction).toHaveBeenCalledTimes(1);
    });

    it("shows spinner fail when install returns false", async () => {
      mockTryRun.mockResolvedValueOnce(false);

      await runInit({ yes: true });

      expect(failSpy).toHaveBeenCalled();
    });

    it("passes the selected agent to GitHub Action setup", async () => {
      await runInit({ yes: true, agent: "codex" });

      expect(mockRunAddGithubAction).toHaveBeenCalledWith({
        yes: true,
        agent: "codex",
        availableAgents: ["claude"],
      });
    });

    it("does not call prompts in non-interactive mode", async () => {
      const { prompts } = await import("../src/utils/prompts");

      await runInit({ yes: true });

      expect(prompts).not.toHaveBeenCalled();
    });
  });
});
