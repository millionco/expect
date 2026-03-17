import { execSync } from "node:child_process";
import { GIT_TIMEOUT_MS } from "./constants.js";

const execGit = (cwd: string, command: string): string => {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return "";
  }
};

export const getLocalBranches = (cwd: string): string[] => {
  const output = execGit(cwd, "git branch --format='%(refname:short)'");
  if (!output) return [];
  return output.split("\n").filter(Boolean);
};

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
