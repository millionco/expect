import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { commandExists } from "../src/utils/command-exists";

const availableCommands = new Set<string>();

vi.mock("which", () => ({
  default: {
    sync: vi.fn((command: string) => {
      if (!availableCommands.has(command)) throw new Error(`not found: ${command}`);
      return `/usr/local/bin/${command}`;
    }),
  },
}));

describe("commandExists", () => {
  beforeEach(() => {
    availableCommands.clear();
  });

  it("returns true when the command is available", async () => {
    availableCommands.add("gh");
    expect(await commandExists("gh")).toBe(true);
  });

  it("returns false when the command is not found", async () => {
    expect(await commandExists("gh")).toBe(false);
  });
});
