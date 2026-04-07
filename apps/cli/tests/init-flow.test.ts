import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readExpectConfig } from "../src/utils/expect-config";

vi.mock("@expect/agent", () => ({
  detectAvailableAgents: vi.fn().mockReturnValue(["claude"]),
}));

vi.mock("@expect/shared/is-command-available", () => ({
  isCommandAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("../src/commands/add-skill", () => ({
  runAddSkill: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/commands/update", () => ({
  detectPackageManager: vi.fn().mockReturnValue("npm"),
  getGlobalInstallCommand: vi.fn().mockReturnValue(["npm", ["install", "-g", "expect-cli"]]),
  formatInstallCommand: vi.fn().mockReturnValue("npm install -g expect-cli"),
  runInstallCommand: vi.fn().mockResolvedValue(true),
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

describe("init flow", () => {
  let projectRoot: string;
  let originalCwd: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "init-flow-"));
    originalCwd = process.cwd;
    process.cwd = () => projectRoot;

    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue(["claude"]);
    const { runInstallCommand } = await import("../src/commands/update");
    vi.mocked(runInstallCommand).mockResolvedValue(true);
    const { isCommandAvailable } = await import("@expect/shared/is-command-available");
    vi.mocked(isCommandAvailable).mockReturnValue(true);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("writes headless config when --headless flag is passed", async () => {
    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    const config = readExpectConfig(projectRoot);
    expect(config).toEqual({ browserMode: "headless" });
  });

  it("writes headed config when --headed flag is passed", async () => {
    const { runInit } = await import("../src/commands/init");
    await runInit({ headed: true });

    const config = readExpectConfig(projectRoot);
    expect(config).toEqual({ browserMode: "headed" });
  });

  it("does not write config in dry mode", async () => {
    const { runInit } = await import("../src/commands/init");
    await runInit({ dry: true, headless: true });

    const config = readExpectConfig(projectRoot);
    expect(config).toBeUndefined();
  });

  it("falls back to headless when --cdp flag is passed but no browser is running", async () => {
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (..._args: unknown[]) {
      process.nextTick(() => this.emit("error", new Error("ECONNREFUSED")));
      return this;
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ cdp: true });

      const config = readExpectConfig(projectRoot);
      expect(config).toEqual({ browserMode: "headless" });
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });

  it("writes cdp config when --cdp flag is passed and a browser is listening", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;

    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args: unknown[]) {
      const targetPort = typeof args[0] === "number" ? args[0] : undefined;
      if (targetPort === 9222) {
        args[0] = port;
      }
      return originalConnect.apply(this, args as Parameters<typeof originalConnect>);
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ cdp: true });

      const config = readExpectConfig(projectRoot);
      expect(config).toEqual({ browserMode: "cdp" });
    } finally {
      net.Socket.prototype.connect = originalConnect;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("skips prompt when a browser mode flag is provided", async () => {
    const { prompts } = await import("../src/utils/prompts");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(prompts).not.toHaveBeenCalled();
  });

  it("calls runAddSkill when not in dry mode", async () => {
    const { runAddSkill } = await import("../src/commands/add-skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(runAddSkill).toHaveBeenCalled();
  });

  it("skips runAddSkill in dry mode", async () => {
    const { runAddSkill } = await import("../src/commands/add-skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ dry: true, headless: true });

    expect(runAddSkill).not.toHaveBeenCalled();
  });

  it("calls runInstallCommand when not in dry mode", async () => {
    const { runInstallCommand } = await import("../src/commands/update");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(runInstallCommand).toHaveBeenCalled();
  });

  it("skips runInstallCommand in dry mode", async () => {
    const { runInstallCommand } = await import("../src/commands/update");

    const { runInit } = await import("../src/commands/init");
    await runInit({ dry: true, headless: true });

    expect(runInstallCommand).not.toHaveBeenCalled();
  });

  it("preserves existing .expect/ files when writing config", async () => {
    const expectDir = path.join(projectRoot, ".expect");
    fs.mkdirSync(expectDir, { recursive: true });
    fs.writeFileSync(path.join(expectDir, "logs.md"), "existing logs");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(fs.readFileSync(path.join(expectDir, "logs.md"), "utf-8")).toBe("existing logs");
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("overwrites existing config on re-init", async () => {
    const expectDir = path.join(projectRoot, ".expect");
    fs.mkdirSync(expectDir, { recursive: true });
    fs.writeFileSync(path.join(expectDir, "config.json"), JSON.stringify({ browserMode: "cdp" }));

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("exits when no agents are detected", async () => {
    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue([]);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const { runInit } = await import("../src/commands/init");
    await expect(runInit({ headless: true })).rejects.toThrow("process.exit");

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it("works when skill directories already exist", async () => {
    const skillDir = path.join(projectRoot, ".agents", "skills", "expect");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "existing skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headed: true });

    expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
  });

  it("passes detected agents to runAddSkill", async () => {
    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue(["claude", "codex", "cursor"]);
    const { runAddSkill } = await import("../src/commands/add-skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(runAddSkill).toHaveBeenCalledWith(
      expect.objectContaining({ agents: ["claude", "codex", "cursor"] }),
    );
  });

  it("passes yes flag through to runAddSkill", async () => {
    const { runAddSkill } = await import("../src/commands/add-skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ yes: true, headless: true });

    expect(runAddSkill).toHaveBeenCalledWith(expect.objectContaining({ yes: true }));
  });

  it("does not write config when no agents and process.exit is caught", async () => {
    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue([]);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const { runInit } = await import("../src/commands/init");
    await expect(runInit({ headless: true })).rejects.toThrow("process.exit");

    expect(readExpectConfig(projectRoot)).toBeUndefined();
    mockExit.mockRestore();
  });

  it("handles global install failure gracefully", async () => {
    const { runInstallCommand } = await import("../src/commands/update");
    vi.mocked(runInstallCommand).mockResolvedValue(false);

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("handles expect-cli not on PATH after install", async () => {
    const { isCommandAvailable } = await import("@expect/shared/is-command-available");
    vi.mocked(isCommandAvailable).mockReturnValue(false);

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("warns when multiple browser mode flags are passed", async () => {
    const { logger } = await import("../src/utils/logger");

    const { runInit } = await import("../src/commands/init");
    await runInit({ cdp: true, headless: true });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Multiple browser mode flags"),
    );
  });

  it("uses first flag when multiple browser mode flags conflict", async () => {
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (..._args: unknown[]) {
      process.nextTick(() => this.emit("error", new Error("ECONNREFUSED")));
      return this;
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ cdp: true, headed: true });

      const config = readExpectConfig(projectRoot);
      expect(config).toEqual({ browserMode: "headless" });
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });

  it("re-init from cdp to headed overwrites correctly", async () => {
    const { runInit } = await import("../src/commands/init");

    await runInit({ headless: true });
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });

    await runInit({ headed: true });
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
  });

  it("re-init from headed to headless overwrites correctly", async () => {
    const { runInit } = await import("../src/commands/init");

    await runInit({ headed: true });
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });

    await runInit({ headless: true });
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("works with a project that has existing .expect/config.json with extra fields", async () => {
    const expectDir = path.join(projectRoot, ".expect");
    fs.mkdirSync(expectDir, { recursive: true });
    fs.writeFileSync(
      path.join(expectDir, "config.json"),
      JSON.stringify({ browserMode: "cdp", customField: "should be overwritten" }),
    );

    const { runInit } = await import("../src/commands/init");
    await runInit({ headed: true });

    const raw = JSON.parse(fs.readFileSync(path.join(expectDir, "config.json"), "utf-8"));
    expect(raw).toEqual({ browserMode: "headed" });
    expect(raw.customField).toBeUndefined();
  });

  it("works with a project that has corrupted .expect/config.json", async () => {
    const expectDir = path.join(projectRoot, ".expect");
    fs.mkdirSync(expectDir, { recursive: true });
    fs.writeFileSync(path.join(expectDir, "config.json"), "corrupted{{{");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("works with full realistic project structure", async () => {
    fs.mkdirSync(path.join(projectRoot, ".agents", "skills", "expect"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".agents", "skills", "expect", "SKILL.md"),
      "---\nname: expect\n---\n",
    );
    fs.mkdirSync(path.join(projectRoot, ".claude", "skills", "expect"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".claude", "skills", "expect", "SKILL.md"),
      "---\nname: expect\n---\n",
    );
    fs.mkdirSync(path.join(projectRoot, ".expect"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".expect", "logs.md"), "[2025-01-01] test log\n");
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"name":"my-app"}');
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), "console.log('hello')");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headed: true });

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
    expect(fs.readFileSync(path.join(projectRoot, ".expect", "logs.md"), "utf-8")).toBe(
      "[2025-01-01] test log\n",
    );
    expect(fs.existsSync(path.join(projectRoot, ".agents", "skills", "expect", "SKILL.md"))).toBe(
      true,
    );
    expect(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8")).toBe(
      '{"name":"my-app"}',
    );
  });

  it("dry mode with --cdp still probes but does not write config", async () => {
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (..._args: unknown[]) {
      process.nextTick(() => this.emit("error", new Error("ECONNREFUSED")));
      return this;
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ dry: true, cdp: true });

      expect(readExpectConfig(projectRoot)).toBeUndefined();
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });

  it("only one agent detected still works", async () => {
    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue(["cursor"]);
    const { runAddSkill } = await import("../src/commands/add-skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(runAddSkill).toHaveBeenCalledWith(expect.objectContaining({ agents: ["cursor"] }));
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("all seven agents detected passes them all to skill install", async () => {
    const allAgents = ["claude", "codex", "copilot", "gemini", "cursor", "opencode", "droid"];
    const { detectAvailableAgents } = await import("@expect/agent");
    vi.mocked(detectAvailableAgents).mockReturnValue(allAgents as never);
    const { runAddSkill } = await import("../src/commands/add-skill");

    const { runInit } = await import("../src/commands/init");
    await runInit({ headed: true });

    expect(runAddSkill).toHaveBeenCalledWith(expect.objectContaining({ agents: allAgents }));
  });

  it("no flags triggers the prompt", async () => {
    const { prompts } = await import("../src/utils/prompts");
    vi.mocked(prompts).mockResolvedValue({ browserMode: "headless" });

    const { runInit } = await import("../src/commands/init");
    await runInit({});

    expect(prompts).toHaveBeenCalled();
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it("prompt returning empty object defaults to cdp then falls back to headless", async () => {
    const { prompts } = await import("../src/utils/prompts");
    vi.mocked(prompts).mockResolvedValue({});

    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (..._args: unknown[]) {
      process.nextTick(() => this.emit("error", new Error("ECONNREFUSED")));
      return this;
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ cdp: true });

      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });

  it("prompt returns headed value directly", async () => {
    const { prompts } = await import("../src/utils/prompts");
    vi.mocked(prompts).mockResolvedValue({ browserMode: "headed" });

    const { runInit } = await import("../src/commands/init");
    await runInit({});

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
  });

  it("prompt returns headless value directly", async () => {
    const { prompts } = await import("../src/utils/prompts");
    vi.mocked(prompts).mockResolvedValue({ browserMode: "headless" });

    const { runInit } = await import("../src/commands/init");
    await runInit({});

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
  });

  it(".expect dir is read-only fails gracefully on write", async () => {
    const expectDir = path.join(projectRoot, ".expect");
    fs.mkdirSync(expectDir, { recursive: true });
    fs.chmodSync(expectDir, 0o444);

    const { runInit } = await import("../src/commands/init");

    try {
      await expect(runInit({ headless: true })).rejects.toThrow();
    } finally {
      fs.chmodSync(expectDir, 0o755);
    }
  });

  it("config.json is read-only gets overwritten on re-init", async () => {
    const expectDir = path.join(projectRoot, ".expect");
    fs.mkdirSync(expectDir, { recursive: true });
    fs.writeFileSync(path.join(expectDir, "config.json"), '{"browserMode":"cdp"}');
    fs.chmodSync(path.join(expectDir, "config.json"), 0o444);

    const { runInit } = await import("../src/commands/init");

    try {
      await expect(runInit({ headless: true })).rejects.toThrow();
    } finally {
      fs.chmodSync(path.join(expectDir, "config.json"), 0o644);
    }
  });

  it("three sequential re-inits produce correct final state", async () => {
    const { runInit } = await import("../src/commands/init");

    await runInit({ headless: true });
    await runInit({ headed: true });
    await runInit({ headless: true });

    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });

    const expectDir = path.join(projectRoot, ".expect");
    const files = fs.readdirSync(expectDir);
    expect(files).toEqual(["config.json"]);
  });

  it("cdp probe on port 9229 works when 9222 is closed", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const realPort = (server.address() as net.AddressInfo).port;

    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args: unknown[]) {
      const targetPort = typeof args[0] === "number" ? args[0] : undefined;
      if (targetPort === 9222) {
        process.nextTick(() => this.emit("error", new Error("ECONNREFUSED")));
        return this;
      }
      if (targetPort === 9229) {
        args[0] = realPort;
      }
      return originalConnect.apply(this, args as Parameters<typeof originalConnect>);
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ cdp: true });

      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "cdp" });
    } finally {
      net.Socket.prototype.connect = originalConnect;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("socket timeout is treated as no CDP available", async () => {
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (..._args: unknown[]) {
      process.nextTick(() => this.emit("timeout"));
      return this;
    } as typeof net.Socket.prototype.connect;

    try {
      const { runInit } = await import("../src/commands/init");
      await runInit({ cdp: true });

      expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headless" });
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });

  it("does not touch files outside .expect/ directory", async () => {
    fs.writeFileSync(path.join(projectRoot, ".gitignore"), "node_modules\n");
    fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(projectRoot, "node_modules", "some-pkg"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "node_modules", "some-pkg", "index.js"),
      "module.exports = {}",
    );

    const { runInit } = await import("../src/commands/init");
    await runInit({ headless: true });

    expect(fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf-8")).toBe("node_modules\n");
    expect(fs.readFileSync(path.join(projectRoot, "tsconfig.json"), "utf-8")).toBe("{}");
    expect(fs.existsSync(path.join(projectRoot, "node_modules", "some-pkg", "index.js"))).toBe(
      true,
    );
  });

  it("yes flag does not affect browser mode when flag is also passed", async () => {
    const { prompts } = await import("../src/utils/prompts");

    const { runInit } = await import("../src/commands/init");
    await runInit({ yes: true, headed: true });

    expect(prompts).not.toHaveBeenCalled();
    expect(readExpectConfig(projectRoot)).toEqual({ browserMode: "headed" });
  });
});
