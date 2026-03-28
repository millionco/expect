import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { execSync } from "node:child_process";
import { detectAvailableAgents } from "../src/detect-agents";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

const WHICH_COMMAND = process.platform === "win32" ? "where" : "which";

describe("detectAvailableAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agents whose binaries are on PATH", () => {
    mockedExecSync.mockImplementation((command) => {
      if (String(command) === `${WHICH_COMMAND} claude`)
        return Buffer.from("/usr/local/bin/claude");
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude"]);
  });

  it("returns empty array when no agents are found", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual([]);
  });

  it("returns multiple agents when available", () => {
    mockedExecSync.mockImplementation((command) => {
      const cmd = String(command);
      if (cmd === `${WHICH_COMMAND} claude` || cmd === `${WHICH_COMMAND} codex`)
        return Buffer.from("");
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude", "codex"]);
  });

  it("detects cursor as a supported agent via agent binary", () => {
    mockedExecSync.mockImplementation((command) => {
      if (String(command) === `${WHICH_COMMAND} agent`) return Buffer.from("/usr/local/bin/agent");
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["cursor"]);
  });

  it("detects copilot as a supported agent", () => {
    mockedExecSync.mockImplementation((command) => {
      if (String(command) === `${WHICH_COMMAND} copilot`)
        return Buffer.from("/usr/local/bin/copilot");
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["copilot"]);
  });

  it("detects gemini as a supported agent", () => {
    mockedExecSync.mockImplementation((command) => {
      if (String(command) === `${WHICH_COMMAND} gemini`)
        return Buffer.from("/usr/local/bin/gemini");
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["gemini"]);
  });

  it("checks all five supported agents", () => {
    mockedExecSync.mockImplementation(() => Buffer.from(""));

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude", "codex", "copilot", "gemini", "cursor"]);
  });

  it("uses platform-specific lookup command for every agent", () => {
    mockedExecSync.mockReturnValue(Buffer.from(""));
    detectAvailableAgents();

    for (const call of mockedExecSync.mock.calls) {
      expect(String(call[0])).toMatch(new RegExp(`^${WHICH_COMMAND} `));
    }
  });
});
