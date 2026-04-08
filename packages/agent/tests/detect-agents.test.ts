import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { detectAvailableAgents } from "../src/detect-agents";
import { isCommandAvailable } from "@expect/shared/is-command-available";

vi.mock("@expect/shared/is-command-available", () => ({
  isCommandAvailable: vi.fn(),
}));

describe("detectAvailableAgents", () => {
  const mockedIsCommandAvailable = vi.mocked(isCommandAvailable);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsCommandAvailable.mockImplementation(() => false);
  });

  it("returns agents whose binaries are on PATH", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "claude");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude"]);
  });

  it("returns empty array when no agents are found", () => {
    mockedIsCommandAvailable.mockImplementation(() => false);

    const agents = detectAvailableAgents();
    expect(agents).toEqual([]);
  });

  it("returns multiple agents when available", () => {
    mockedIsCommandAvailable.mockImplementation(
      (command: string) => command === "claude" || command === "codex",
    );

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude", "codex"]);
  });

  it("detects cursor via cursor binary", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "cursor");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["cursor"]);
  });

  it("detects cursor via agent binary fallback", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "agent");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["cursor"]);
  });

  it("detects copilot as a supported agent", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "copilot");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["copilot"]);
  });

  it("detects gemini as a supported agent", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "gemini");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["gemini"]);
  });

  it("detects opencode as a supported agent", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "opencode");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["opencode"]);
  });

  it("detects droid as a supported agent", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "droid");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["droid"]);
  });

  it("detects pi as a supported agent", () => {
    mockedIsCommandAvailable.mockImplementation((command: string) => command === "pi");

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["pi"]);
  });

  it("checks all eight supported agents", () => {
    mockedIsCommandAvailable.mockImplementation(() => true);

    const agents = detectAvailableAgents();
    expect(agents).toEqual([
      "claude",
      "codex",
      "copilot",
      "gemini",
      "cursor",
      "opencode",
      "droid",
      "pi",
    ]);
  });

  it("checks command availability for configured binaries", () => {
    detectAvailableAgents();
    const checkedCommands = mockedIsCommandAvailable.mock.calls.map((call) => call[0]);
    expect(checkedCommands).toContain("claude");
    expect(checkedCommands).toContain("codex");
    expect(checkedCommands).toContain("copilot");
    expect(checkedCommands).toContain("gemini");
    expect(checkedCommands).toContain("cursor");
    expect(checkedCommands).toContain("agent");
    expect(checkedCommands).toContain("opencode");
    expect(checkedCommands).toContain("droid");
    expect(checkedCommands).toContain("pi");
  });
});
