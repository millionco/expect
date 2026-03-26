import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { execFile } from "node:child_process";
import { commandExists } from "../src/utils/command-exists";

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

const mockedExecFile = vi.mocked(execFile);
const EXPECTED_LOOKUP = process.platform === "win32" ? "where" : "which";

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

  it("uses platform-specific lookup command", async () => {
    availableCommands.add("node");
    await commandExists("node");
    expect(mockedExecFile).toHaveBeenCalledWith(
      EXPECTED_LOOKUP,
      ["node"],
      {},
      expect.any(Function),
    );
  });
});
