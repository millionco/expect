import { execSync } from "node:child_process";

import { DEFAULT_TIMEOUT_MS } from "./constants";

export const execCommand = (command: string, timeoutMs = DEFAULT_TIMEOUT_MS): string | null => {
  try {
    return execSync(command, { encoding: "utf-8", stdio: "pipe", timeout: timeoutMs }).trim();
  } catch {
    return null;
  }
};
