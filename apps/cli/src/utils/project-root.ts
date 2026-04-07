import { spawnSync } from "node:child_process";
import * as path from "node:path";

const GIT_ROOT_TIMEOUT_MS = 5_000;

const findGitRoot = (): string | undefined => {
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GIT_ROOT_TIMEOUT_MS,
    });
    const root = result.stdout?.trim();
    return root && path.isAbsolute(root) ? root : undefined;
  } catch {
    return undefined;
  }
};

export const resolveProjectRoot = (): string => findGitRoot() ?? process.cwd();
