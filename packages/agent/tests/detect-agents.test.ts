import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { detectAvailableAgents } from "../src/detect-agents";
import { isCommandAvailable } from "@expect/shared/is-command-available";

vi.mock("which", () => ({
  default: {
    sync: vi.fn(),
  },
}));

const getMockedWhichSync = async () => {
  const whichModule = await import("which");
  return vi.mocked(whichModule.default.sync);
};

describe("detectAvailableAgents", () => {
  let mockedWhichSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedWhichSync = await getMockedWhichSync();
  });

  it("returns agents whose binaries are on PATH", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "claude") return "/usr/local/bin/claude";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude"]);
  });

  it("returns empty array when no agents are found", () => {
    mockedWhichSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual([]);
  });

  it("returns multiple agents when available", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "claude" || command === "codex") return `/usr/local/bin/${command}`;
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["claude", "codex"]);
  });

  it("detects cursor via cursor binary", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "cursor") return "/usr/local/bin/cursor";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["cursor"]);
  });

  it("detects cursor via agent binary fallback", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "agent") return "/usr/local/bin/agent";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["cursor"]);
  });

  it("detects copilot as a supported agent", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "copilot") return "/usr/local/bin/copilot";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["copilot"]);
  });

  it("detects gemini as a supported agent", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "gemini") return "/usr/local/bin/gemini";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["gemini"]);
  });

  it("detects opencode as a supported agent", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "opencode") return "/usr/local/bin/opencode";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["opencode"]);
  });

  it("detects droid as a supported agent", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "droid") return "/usr/local/bin/droid";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["droid"]);
  });

  it("detects pi as a supported agent", () => {
    mockedWhichSync.mockImplementation((command: string) => {
      if (command === "pi") return "/usr/local/bin/pi";
      throw new Error("not found");
    });

    const agents = detectAvailableAgents();
    expect(agents).toEqual(["pi"]);
  });

  it("checks all eight supported agents", () => {
    mockedWhichSync.mockImplementation((command: string) => `/usr/local/bin/${command}`);

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

  it("isCommandAvailable returns true when binary is on PATH", () => {
    mockedWhichSync.mockReturnValue("/usr/local/bin/node");
    expect(isCommandAvailable("node")).toBe(true);
  });

  it("isCommandAvailable returns false when binary is not found", () => {
    mockedWhichSync.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(isCommandAvailable("nonexistent")).toBe(false);
  });
});
