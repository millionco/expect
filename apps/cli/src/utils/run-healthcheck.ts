import readline from "node:readline";
import figures from "figures";
import pc from "picocolors";
import { VERSION } from "../constants.js";

interface HealthcheckResult {
  shouldTest: boolean;
  scope: string;
}

export const runHealthcheckHeadless = async (): Promise<void> => {
  process.stdout.write(
    JSON.stringify(
      {
        version: VERSION,
        hasUntestedChanges: false,
        isGitRepo: false,
        branch: "unknown",
        isOnMain: false,
        scope: "changes",
        changedLines: 0,
        fileCount: 0,
        webFiles: {
          categories: [],
          total: 0,
        },
        changedFiles: [],
      },
      null,
      2,
    ) + "\n",
  );
};

export const runHealthcheckInteractive = async (): Promise<HealthcheckResult> => {
  process.stdout.write(`${pc.bold("testie")} v${VERSION} healthcheck\n\n`);
  process.stdout.write(`${pc.yellow(figures.warning)} Healthcheck is not available.\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${pc.cyan("?")} Run tests anyway? ${pc.dim("(Y/n)")} `, resolve);
  });
  rl.close();

  const shouldTest = answer.trim().toLowerCase() !== "n";
  return { shouldTest, scope: "changes" };
};
