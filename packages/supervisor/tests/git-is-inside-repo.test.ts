import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { isInsideGitRepo } from "../src/git.js";

const commandOutputs = new Map<string, string>();

vi.mock("node:child_process", () => ({
  execSync: vi.fn((command: string) => {
    const output = commandOutputs.get(command);
    if (output === undefined) throw new Error(`Command failed: ${command}`);
    return output;
  }),
}));

describe("isInsideGitRepo", () => {
  beforeEach(() => {
    commandOutputs.clear();
  });

  it("returns true when inside a git repository", () => {
    commandOutputs.set("git rev-parse --is-inside-work-tree", "true");
    expect(isInsideGitRepo("/tmp/repo")).toBe(true);
  });

  it("returns false when the command fails", () => {
    expect(isInsideGitRepo("/tmp/not-a-repo")).toBe(false);
  });
});
