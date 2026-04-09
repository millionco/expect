import { execSync } from "node:child_process";
import { GIT_TIMEOUT_MS } from "./constants";

export const checkoutBranch = (cwd: string, branch: string): boolean => {
  try {
    execSync(`git checkout ${branch}`, {
      cwd,
      encoding: "utf-8",
      timeout: GIT_TIMEOUT_MS,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
};
