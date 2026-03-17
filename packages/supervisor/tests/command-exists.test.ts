import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { commandExists } from "../src/utils/command-exists.js";

const availableCommands = new Set<string>();

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_command: string, args: string[], _options: unknown, callback: Function) => {
    const target = args[0];
    if (!availableCommands.has(target)) {
      callback(new Error(`not found: ${target}`));
    } else {
      callback(null, `/usr/local/bin/${target}`, "");
    }
  }),
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
