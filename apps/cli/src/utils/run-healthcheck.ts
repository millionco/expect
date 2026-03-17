import readline from "node:readline";
import figures from "figures";
import pc from "picocolors";
import {
  formatFileCategories,
  getGitState,
  getHealthcheckReport,
  type TestScope,
} from "@browser-tester/supervisor";
import { VERSION } from "../constants.js";

interface HealthcheckResult {
  shouldTest: boolean;
  scope: TestScope;
}

export const runHealthcheckHeadless = (): void => {
  const gitState = getGitState();
  const report = getHealthcheckReport(gitState);

  process.stdout.write(
    JSON.stringify(
      {
        version: VERSION,
        hasUntestedChanges: report.hasUntestedChanges,
        isGitRepo: gitState.isGitRepo,
        branch: gitState.currentBranch,
        isOnMain: gitState.isOnMain,
        scope: report.scope,
        changedLines: report.changedLines,
        fileCount: report.fileCount,
        webFiles: {
          categories: report.categories,
          total: report.totalWebFiles,
        },
        changedFiles: report.changedFilePaths,
      },
      null,
      2,
    ) + "\n",
  );
};

export const runHealthcheckInteractive = async (): Promise<HealthcheckResult> => {
  const gitState = getGitState();
  const report = getHealthcheckReport(gitState);

  process.stdout.write(`${pc.bold("testie")} v${VERSION} healthcheck\n\n`);

  if (!gitState.isGitRepo) {
    process.stdout.write(`${pc.yellow(figures.warning)} Not a git repository.\n`);
    return { shouldTest: false, scope: report.scope };
  }

  if (!report.hasUntestedChanges) {
    process.stdout.write(
      `${pc.green(figures.tick)} No untested changes detected on ${pc.bold(gitState.currentBranch)}.\n`,
    );
    return { shouldTest: false, scope: report.scope };
  }

  process.stdout.write(
    `${pc.yellow(figures.warning)} ${pc.bold(pc.yellow(`${report.changedLines} changed lines not tested`))}\n\n`,
  );

  if (report.categories.length > 0) {
    process.stdout.write(`  ${formatFileCategories(report.categories)} affected\n`);
  }

  if (gitState.hasUnstagedChanges) {
    process.stdout.write(`  ${pc.dim(`${report.fileCount} files with unstaged changes`)}\n`);
  }

  if (gitState.hasBranchCommits) {
    process.stdout.write(
      `  ${pc.dim(`${gitState.branchCommitCount} commit${gitState.branchCommitCount === 1 ? "" : "s"} on ${gitState.currentBranch}`)}\n`,
    );
  }

  process.stdout.write("\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${pc.cyan("?")} Run tests? ${pc.dim("(Y/n)")} `, resolve);
  });
  rl.close();

  const shouldTest = answer.trim().toLowerCase() !== "n";
  return { shouldTest, scope: report.scope };
};
