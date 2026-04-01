import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const availableCommands = new Set<string>();

vi.mock("@expect/agent", () => ({
  isCommandAvailable: vi.fn((command: string) => availableCommands.has(command)),
}));

describe("commandExists", () => {
  beforeEach(() => {
    availableCommands.clear();
  });

  it("returns true when the command is available", async () => {
    availableCommands.add("gh");
    const { commandExists } = await import("../src/utils/command-exists");
    expect(commandExists("gh")).toBe(true);
  });

  it("returns false when the command is not found", async () => {
    const { commandExists } = await import("../src/utils/command-exists");
    expect(commandExists("gh")).toBe(false);
  });
});
