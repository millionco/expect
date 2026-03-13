import { execSync } from "child_process";
import { SWITCH_BRANCH_TIMEOUT_MS } from "../constants.js";

export const switchBranch = (branch: string): boolean => {
  try {
    execSync(`git checkout ${branch}`, {
      encoding: "utf-8",
      timeout: SWITCH_BRANCH_TIMEOUT_MS,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
};
