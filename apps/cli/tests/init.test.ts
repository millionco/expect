import { beforeAll, describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { exec } from "node:child_process";

const succeedSpy = vi.fn();
const failSpy = vi.fn();
const mockDetectAvailableAgents = vi.fn();
let detectPackageManager: typeof import("../src/commands/init").detectPackageManager;
let runInit: typeof import("../src/commands/init").runInit;

vi.mock("node:child_process", () => ({
  exec: vi.fn((_: string, __: unknown, callback: (error: Error | null) => void) => {
    callback(null);
    return {
      stdin: {
        end: vi.fn(),
      },
    };
  }),
}));

vi.mock("@expect/agent", () => ({
  detectAvailableAgents: (...args: unknown[]) => mockDetectAvailableAgents(...args),
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
  prompts: vi.fn().mockResolvedValue({ installSkill: false }),
}));

const mockedExec = vi.mocked(exec);

describe("init", () => {
  beforeAll(async () => {
    vi.stubGlobal("__VERSION__", "test");
    const initModule = await import("../src/commands/init");
    detectPackageManager = initModule.detectPackageManager;
    runInit = initModule.runInit;
  });

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
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.VITE_PLUS_CLI_BIN;
      delete process.env.npm_config_user_agent;
      vi.clearAllMocks();
      mockDetectAvailableAgents.mockReturnValue(["claude"]);
      mockedExec.mockImplementation(
        (_: string, __: unknown, callback: (error: Error | null) => void) => {
          callback(null);
          return {
            stdin: {
              end: vi.fn(),
            },
          };
        },
      );
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("exits with error when no agents are detected", async () => {
      mockDetectAvailableAgents.mockReturnValue([]);

      await runInit({ yes: true });

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("proceeds when at least one agent is detected", async () => {
      mockDetectAvailableAgents.mockReturnValue(["claude"]);

      await runInit({ yes: true });

      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("global install command uses the detected package manager binary", async () => {
      process.env.npm_config_user_agent = "pnpm/8.15.0 node/v20.0.0";

      await runInit({ yes: true });

      const installCall = mockedExec.mock.calls.find((call) => String(call[0]).includes("-g"));
      expect(installCall).toBeDefined();
      expect(String(installCall![0])).toMatch(/^pnpm /);
    });

    it("uses vp binary when VITE_PLUS_CLI_BIN is set", async () => {
      process.env.VITE_PLUS_CLI_BIN = "/usr/local/bin/vp";

      await runInit({ yes: true });

      const installCall = mockedExec.mock.calls.find((call) => String(call[0]).includes("-g"));
      expect(installCall).toBeDefined();
      expect(String(installCall![0])).toMatch(/^vp /);
    });

    it("continues to skill install even when global install fails", async () => {
      mockedExec.mockImplementation(
        (command: string, _options: unknown, callback: (error: Error | null) => void) => {
          const cmd = String(command);
          callback(cmd.includes("-g") ? new Error("install failed") : null);
          return {
            stdin: {
              end: vi.fn(),
            },
          };
        },
      );

      await runInit({ yes: true });

      const skillCall = mockedExec.mock.calls.find((call) =>
        String(call[0]).includes("skills add"),
      );
      expect(skillCall).toBeDefined();
    });

    it("shows spinner fail when install throws", async () => {
      mockedExec.mockImplementation(
        (_: string, __: unknown, callback: (error: Error | null) => void) => {
          callback(new Error("install failed"));
          return {
            stdin: {
              end: vi.fn(),
            },
          };
        },
      );

      await runInit({ yes: true });

      expect(failSpy).toHaveBeenCalled();
    });

    it("does not call prompts in non-interactive mode", async () => {
      const { prompts } = await import("../src/utils/prompts");

      await runInit({ yes: true });

      expect(prompts).not.toHaveBeenCalled();
    });
  });
});
