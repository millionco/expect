import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readProjectPreference } from "../src/utils/project-preferences-io";

vi.mock("../src/utils/project-root", () => ({
  resolveProjectRoot: vi.fn().mockResolvedValue("/tmp"),
}));

vi.mock("@expect/agent", () => ({
  detectAvailableAgents: vi.fn().mockReturnValue(["claude"]),
  toDisplayName: vi.fn((agent: string) => {
    const displayNames: Record<string, string> = {
      claude: "Claude Code",
      codex: "Codex",
      copilot: "GitHub Copilot",
      gemini: "Gemini CLI",
      cursor: "Cursor",
      opencode: "OpenCode",
      droid: "Factory Droid",
      pi: "Pi",
    };
    return displayNames[agent] ?? agent;
  }),
  toSkillDir: vi.fn((agent: string) => {
    const skillDirs: Record<string, string> = {
      claude: ".claude/skills",
      codex: ".codex/skills",
      copilot: ".github/copilot/skills",
      gemini: ".gemini/skills",
      cursor: ".cursor/skills",
      opencode: ".opencode/skills",
      droid: ".droid/skills",
      pi: ".pi/skills",
    };
    return skillDirs[agent] ?? `.${agent}/skills`;
  }),
}));

vi.mock("../src/mcp/install-expect-mcp", () => ({
  formatExpectMcpInstallSummary: vi.fn().mockReturnValue("Expect MCP installed for Claude Code."),
  getSupportedExpectMcpAgents: vi.fn((agents: string[]) => agents),
  getUnsupportedExpectMcpAgents: vi.fn().mockReturnValue([]),
  installExpectMcpForAgents: vi.fn().mockReturnValue({
    scope: "global",
    selectedAgents: ["claude"],
    installed: ["claude"],
    updated: [],
    alreadyInstalled: [],
    failed: [],
  }),
  selectExpectMcpInstallScope: vi.fn(async () => "global"),
  selectExpectMcpAgents: vi.fn(async (agents: string[]) => agents),
}));

vi.mock("../src/commands/add-skill", () => ({
  runAddSkill: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/commands/update", () => ({
  getGlobalInstallCommand: vi.fn().mockReturnValue(["npm", "install", "-g", "expect-cli"]),
  formatInstallCommand: vi.fn((command: string[]) => command.join(" ")),
  runInstallCommand: vi.fn().mockResolvedValue(true),
}));

vi.mock("@expect/shared/is-command-available", () => ({
  isCommandAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("../src/utils/prompts", () => ({
  prompts: vi.fn().mockResolvedValue({}),
  setOnCancel: vi.fn(),
}));

vi.mock("../src/utils/spinner", () => {
  const mockSpinner = () => {
    const instance = {
      start: () => instance,
      succeed: () => instance,
      warn: () => instance,
      fail: () => instance,
      stop: () => instance,
      text: "",
    };
    return instance;
  };
  return { spinner: mockSpinner };
});

vi.mock("../src/utils/logger", () => ({
  logger: {
    log: vi.fn(),
    dim: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    break: vi.fn(),
  },
}));

vi.mock("../src/utils/highlighter", () => ({
  highlighter: {
    info: (text: string) => text,
    dim: (text: string) => text,
  },
}));

const withNoNetwork = (fn: () => Promise<void>) => {
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (..._args: unknown[]) {
    process.nextTick(() => this.emit("error", new Error("ECONNREFUSED")));
    return this;
  } as typeof net.Socket.prototype.connect;
  return fn().finally(() => {
    net.Socket.prototype.connect = originalConnect;
  });
};

const withFakeCdp = async (targetPort: number, fn: () => Promise<void>) => {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const realPort = (server.address() as net.AddressInfo).port;

  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args: unknown[]) {
    if (typeof args[0] === "number" && args[0] === targetPort) {
      args[0] = realPort;
    }
    return originalConnect.apply(this, args as Parameters<typeof originalConnect>);
  } as typeof net.Socket.prototype.connect;

  return fn().finally(async () => {
    net.Socket.prototype.connect = originalConnect;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
};

const setupFixture = (projectRoot: string, files: Record<string, string>) => {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(projectRoot, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
};

const assertFilesUnchanged = (projectRoot: string, files: Record<string, string>) => {
  for (const [filePath, expectedContent] of Object.entries(files)) {
    const fullPath = path.join(projectRoot, filePath);
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.readFileSync(fullPath, "utf-8")).toBe(expectedContent);
  }
};

describe("init flow", () => {
  let projectRoot: string;
  let originalCwd: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "init-flow-"));
    originalCwd = process.cwd;
    process.cwd = () => projectRoot;

    const { resolveProjectRoot } = await import("../src/utils/project-root");
    vi.mocked(resolveProjectRoot).mockResolvedValue(projectRoot);
    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue(["claude"]);
    const { runAddSkill } = await import("../src/commands/add-skill");
    vi.mocked(runAddSkill).mockResolvedValue(undefined);
    const { runInstallCommand } = await import("../src/commands/update");
    vi.mocked(runInstallCommand).mockResolvedValue(true);
    const { isCommandAvailable } = await import("@expect/shared/is-command-available");
    vi.mocked(isCommandAvailable).mockReturnValue(true);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  describe("browser mode flags", () => {
    it("--headless writes headless config and skips prompt", async () => {
      const { prompts } = await import("../src/utils/prompts");
      const { runInit } = await import("../src/commands/init");
      await runInit({ headless: true });

      expect(prompts).not.toHaveBeenCalled();
      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headless");
    });

    it("--headed writes headed config and skips prompt", async () => {
      const { prompts } = await import("../src/utils/prompts");
      const { runInit } = await import("../src/commands/init");
      await runInit({ headed: true });

      expect(prompts).not.toHaveBeenCalled();
      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headed");
    });

    it("conflicting --headed and --headless warns and uses headed", async () => {
      const { logger } = await import("../src/utils/logger");
      const { runInit } = await import("../src/commands/init");
      await runInit({ headed: true, headless: true });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Both --headed and --headless"),
      );
      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headed");
    });

    it("no flags triggers interactive prompt", async () => {
      const { prompts } = await import("../src/utils/prompts");
      vi.mocked(prompts).mockResolvedValue({ browserMode: "headless" });

      const { runInit } = await import("../src/commands/init");
      await runInit({});

      expect(prompts).toHaveBeenCalled();
      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headless");
    });

    it("prompt returns invalid value — defaults to headed", async () => {
      const { prompts } = await import("../src/utils/prompts");
      vi.mocked(prompts).mockResolvedValue({ browserMode: "garbage" });

      const { runInit } = await import("../src/commands/init");
      await runInit({});

      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headed");
    });
  });

  describe("dry mode", () => {
    it("does not write config", async () => {
      const { runInit } = await import("../src/commands/init");
      await runInit({ dry: true, headless: true });
      expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
    });

    it("does not call runAddSkill", async () => {
      const { runAddSkill } = await import("../src/commands/add-skill");
      const { runInit } = await import("../src/commands/init");
      await runInit({ dry: true, headless: true });
      expect(runAddSkill).not.toHaveBeenCalled();
    });

    it("does not call runInstallCommand", async () => {
      const { runInstallCommand } = await import("../src/commands/update");
      const { runInit } = await import("../src/commands/init");
      await runInit({ dry: true, headless: true });
      expect(runInstallCommand).not.toHaveBeenCalled();
    });

    it("still shows Setup complete", async () => {
      const { logger } = await import("../src/utils/logger");
      const { runInit } = await import("../src/commands/init");
      await runInit({ dry: true, headed: true });
      expect(logger.success).toHaveBeenCalledWith("Setup complete!");
    });

    it("--dry --headed does not persist", async () => {
      const { runInit } = await import("../src/commands/init");
      await runInit({ dry: true, headed: true });
      expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
    });
  });

  describe("failure modes", () => {
    it("runAddSkill throws — no config written", async () => {
      const { runAddSkill } = await import("../src/commands/add-skill");
      vi.mocked(runAddSkill).mockRejectedValue(new Error("network error"));

      const { runInit } = await import("../src/commands/init");
      await expect(runInit({ headless: true })).rejects.toThrow("network error");

      expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
    });

    it("runInstallCommand throws — no config written", async () => {
      const { runInstallCommand } = await import("../src/commands/update");
      vi.mocked(runInstallCommand).mockRejectedValue(new Error("EACCES"));

      const { runInit } = await import("../src/commands/init");
      await expect(runInit({ headless: true })).rejects.toThrow("EACCES");
      expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
    });

    it("detectAvailableAgents throws — init crashes immediately", async () => {
      const { detectAvailableAgents } = await import("@expect/agent");
      vi.mocked(detectAvailableAgents).mockImplementation(() => {
        throw new Error("segfault");
      });

      const { runInit } = await import("../src/commands/init");
      await expect(runInit({})).rejects.toThrow("segfault");
    });

    it("no agents — exits before any install or config", async () => {
      const { detectAvailableAgents } = await import("@expect/agent");
      vi.mocked(detectAvailableAgents).mockReturnValue([]);
      const { runAddSkill } = await import("../src/commands/add-skill");

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      const { runInit } = await import("../src/commands/init");
      await expect(runInit({ headless: true })).rejects.toThrow("process.exit");

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(runAddSkill).not.toHaveBeenCalled();
      expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
      mockExit.mockRestore();
    });

    it("prompt throws (stdin closed) — no config written", async () => {
      const { prompts } = await import("../src/utils/prompts");
      vi.mocked(prompts).mockRejectedValue(new Error("stdin closed"));

      const { runInit } = await import("../src/commands/init");
      await expect(runInit({})).rejects.toThrow("stdin closed");
      expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
    });

    it("global install fails — still completes init", async () => {
      const { runInstallCommand } = await import("../src/commands/update");
      vi.mocked(runInstallCommand).mockResolvedValue(false);

      const { runInit } = await import("../src/commands/init");
      await runInit({ headless: true });

      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headless");
    });

    it("read-only .expect dir — init completes but preference is not written", async () => {
      const expectDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(expectDir, { recursive: true });
      fs.chmodSync(expectDir, 0o444);

      const { runInit } = await import("../src/commands/init");
      try {
        await runInit({ headless: true });
        expect(readProjectPreference(projectRoot, "browserMode")).toBeUndefined();
      } finally {
        fs.chmodSync(expectDir, 0o755);
      }
    });

    it("read-only project-preferences.json — init completes but preference keeps old value", async () => {
      const expectDir = path.join(projectRoot, ".expect");
      fs.mkdirSync(expectDir, { recursive: true });
      fs.writeFileSync(
        path.join(expectDir, "project-preferences.json"),
        '{"state":{"browserMode":"cdp"},"version":0}',
      );
      fs.chmodSync(path.join(expectDir, "project-preferences.json"), 0o444);

      const { runInit } = await import("../src/commands/init");
      try {
        await runInit({ headless: true });
        expect(readProjectPreference(projectRoot, "browserMode")).toBe("cdp");
      } finally {
        fs.chmodSync(path.join(expectDir, "project-preferences.json"), 0o644);
      }
    });
  });

  describe("state transitions", () => {
    it("re-init overwrites previous config", async () => {
      const { runInit } = await import("../src/commands/init");

      await runInit({ headless: true });
      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headless");

      await runInit({ headed: true });
      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headed");
    });

    it("corrupted project-preferences.json is overwritten cleanly", async () => {
      setupFixture(projectRoot, { ".expect/project-preferences.json": "corrupted{{{" });

      const { runInit } = await import("../src/commands/init");
      await runInit({ headless: true });

      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headless");
    });

    it("concurrent inits produce valid JSON", async () => {
      const { runInit } = await import("../src/commands/init");

      await Promise.all([runInit({ headless: true }), runInit({ headed: true })]);

      const raw = fs.readFileSync(
        path.join(projectRoot, ".expect", "project-preferences.json"),
        "utf-8",
      );
      expect(() => JSON.parse(raw)).not.toThrow();
      const browserMode = readProjectPreference<string>(projectRoot, "browserMode");
      expect(browserMode).toBeDefined();
      expect(["headed", "headless"]).toContain(browserMode);
    });

    it("preserves .expect/logs.md across re-init", async () => {
      setupFixture(projectRoot, {
        ".expect/logs.md": "important logs\n",
        ".expect/project-preferences.json": '{"state":{"browserMode":"cdp"},"version":0}',
      });

      const { runInit } = await import("../src/commands/init");
      await runInit({ headless: true });

      expect(fs.readFileSync(path.join(projectRoot, ".expect", "logs.md"), "utf-8")).toBe(
        "important logs\n",
      );
    });
  });

  describe("realistic project fixtures", () => {
    it("project already using expect — re-init only touches config", async () => {
      const files = {
        "package.json": '{"name":"my-app"}',
        ".agents/skills/expect/SKILL.md": '---\nname: expect\nmetadata:\n  version: "2.1.0"\n---\n',
        ".claude/skills/expect/SKILL.md": "---\nname: expect\n---\n",
        ".expect/project-preferences.json": '{"state":{"browserMode":"cdp"},"version":0}',
        ".expect/logs.md": "[2025-06-15] Previous test run\n",
        "src/index.ts": "console.log('hello')",
        ".gitignore": "node_modules\n.expect\n",
      };
      setupFixture(projectRoot, files);

      const { runInit } = await import("../src/commands/init");
      await runInit({ headless: true });

      expect(readProjectPreference(projectRoot, "browserMode")).toBe("headless");
      assertFilesUnchanged(projectRoot, {
        ".expect/logs.md": "[2025-06-15] Previous test run\n",
        ".agents/skills/expect/SKILL.md": '---\nname: expect\nmetadata:\n  version: "2.1.0"\n---\n',
        "src/index.ts": "console.log('hello')",
        ".gitignore": "node_modules\n.expect\n",
      });
    });

    it("symlinked project root works", async () => {
      const symlinkRoot = path.join(os.tmpdir(), `init-symlink-${Date.now()}`);
      fs.symlinkSync(projectRoot, symlinkRoot);
      process.cwd = () => symlinkRoot;
      const { resolveProjectRoot } = await import("../src/utils/project-root");
      vi.mocked(resolveProjectRoot).mockResolvedValue(symlinkRoot);

      try {
        const { runInit } = await import("../src/commands/init");
        await runInit({ headless: true });
        expect(readProjectPreference(symlinkRoot, "browserMode")).toBe("headless");
      } finally {
        fs.unlinkSync(symlinkRoot);
      }
    });

    it("empty project directory — creates .expect from scratch", async () => {
      const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "init-empty-"));
      process.cwd = () => emptyRoot;
      const { resolveProjectRoot } = await import("../src/utils/project-root");
      vi.mocked(resolveProjectRoot).mockResolvedValue(emptyRoot);

      try {
        const { runInit } = await import("../src/commands/init");
        await runInit({ headless: true });
        expect(readProjectPreference(emptyRoot, "browserMode")).toBe("headless");
      } finally {
        fs.rmSync(emptyRoot, { recursive: true, force: true });
      }
    });
  });

  describe("argument forwarding", () => {
    it("passes detected agents to runAddSkill", async () => {
      const { detectAvailableAgents } = await import("@expect/agent");
      vi.mocked(detectAvailableAgents).mockReturnValue(["claude", "codex", "cursor"]);
      const { runAddSkill } = await import("../src/commands/add-skill");

      const { runInit } = await import("../src/commands/init");
      await runInit({ headless: true });

      expect(runAddSkill).toHaveBeenCalledWith({
        yes: undefined,
        agents: ["claude", "codex", "cursor"],
      });
    });

    it("forwards --yes to runAddSkill", async () => {
      const { runAddSkill } = await import("../src/commands/add-skill");

      const { runInit } = await import("../src/commands/init");
      await runInit({ yes: true, headless: true });

      expect(runAddSkill).toHaveBeenCalledWith({
        yes: true,
        agents: ["claude"],
      });
    });
  });

  describe("chrome version detection", () => {
    const fakeChrome = "/fake/chrome";
    const mockRun = (stdout: string | undefined) => () => stdout;
    const throwingRun = () => {
      throw new Error("spawn failed");
    };

    it("parses Chrome 146", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Google Chrome 146.0.7680.178\n"))).toBe(
        146,
      );
    });

    it("parses Chrome 130", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Google Chrome 130.0.6723.91\n"))).toBe(130);
    });

    it("parses Chromium version string", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Chromium 146.0.7680.0\n"))).toBe(146);
    });

    it("parses Brave version string", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Brave Browser 146.1.77.100\n"))).toBe(146);
    });

    it("boundary: version 144 meets threshold", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Google Chrome 144.0.0.0\n"))).toBe(144);
    });

    it("boundary: version 143 below threshold", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Google Chrome 143.99.99.99\n"))).toBe(143);
    });

    it("returns undefined for garbage output", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("not a version"))).toBeUndefined();
    });

    it("returns undefined for empty stdout", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun(""))).toBeUndefined();
    });

    it("returns undefined for undefined stdout (timeout/crash)", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun(undefined))).toBeUndefined();
    });

    it("returns undefined when command throws", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, throwingRun)).toBeUndefined();
    });

    it("returns undefined for nonexistent binary path", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(
        getChromeMajorVersion("/nonexistent/path/to/chrome", mockRun(undefined)),
      ).toBeUndefined();
    });

    it("handles version with extra whitespace", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("  Google Chrome 145.0.1.2  \n"))).toBe(145);
    });

    it("handles version embedded in longer output", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(
        getChromeMajorVersion(
          fakeChrome,
          mockRun("Some prefix Google Chrome 146.0.7680.178 suffix"),
        ),
      ).toBe(146);
    });

    it("rejects partial version strings (only 3 segments)", async () => {
      const { getChromeMajorVersion } = await import("../src/commands/init");
      expect(getChromeMajorVersion(fakeChrome, mockRun("Chrome 146.0.0"))).toBeUndefined();
    });

    it("findSystemChromePath returns path when file exists", async () => {
      const { findSystemChromePath } = await import("../src/commands/init");
      const result = findSystemChromePath(() => true);
      expect(typeof result).toBe("string");
      expect(result!.length).toBeGreaterThan(0);
    });

    it("findSystemChromePath returns undefined when nothing exists", async () => {
      const { findSystemChromePath } = await import("../src/commands/init");
      expect(findSystemChromePath(() => false)).toBeUndefined();
    });

    it("findSystemChromePath returns first match", async () => {
      let callCount = 0;
      const { findSystemChromePath } = await import("../src/commands/init");
      const result = findSystemChromePath(() => {
        callCount++;
        return true;
      });
      expect(result).toBeDefined();
      expect(callCount).toBe(1);
    });

    it("findSystemChromePath fileExists callback receives absolute paths", async () => {
      const checked: string[] = [];
      const { findSystemChromePath } = await import("../src/commands/init");
      findSystemChromePath((filePath) => {
        checked.push(filePath);
        return false;
      });
      for (const filePath of checked) {
        expect(path.isAbsolute(filePath)).toBe(true);
      }
    });
  });
});
