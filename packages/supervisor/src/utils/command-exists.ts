import { execFile } from "node:child_process";

export const commandExists = (command: string): Promise<boolean> =>
  new Promise((resolve) => {
    execFile("which", [command], {}, (error) => {
      resolve(!error);
    });
  });
