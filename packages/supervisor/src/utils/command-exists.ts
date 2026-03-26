import { execFile } from "node:child_process";

const WHICH_COMMAND = process.platform === "win32" ? "where" : "which";

export const commandExists = (command: string): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(WHICH_COMMAND, [command], {}, (error) => {
      resolve(!error);
    });
  });
