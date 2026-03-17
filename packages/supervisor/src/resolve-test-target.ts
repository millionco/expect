import { Effect } from "effect";
import { ensureSafeCurrentWorkingDirectory } from "@browser-tester/utils";
import { ChangesFor, Git } from "./git/index.js";
import type { ResolveTestTargetOptions, TestTarget } from "./types.js";

const resolveCommitDisplayName = (commitShortHash?: string, commitSubject?: string): string => {
  if (commitShortHash && commitSubject) return `commit ${commitShortHash} (${commitSubject})`;
  if (commitShortHash) return `commit ${commitShortHash}`;
  return "selected commit";
};

export const resolveTestTarget = Effect.fn("resolveTestTarget")(function* (
  options: ResolveTestTargetOptions,
) {
  const cwd = ensureSafeCurrentWorkingDirectory(options.cwd);
  const git = yield* Git;
  const currentBranch = yield* git.getCurrentBranch;
  const mainBranch = yield* git.getMainBranch;

  const changesFor =
    options.selection.action === "test-unstaged"
      ? ChangesFor.WorkingTree()
      : options.selection.action === "test-changes"
        ? mainBranch
          ? ChangesFor.Changes({ mainBranch })
          : ChangesFor.WorkingTree()
        : options.selection.action === "test-branch"
          ? mainBranch
            ? ChangesFor.Branch({ mainBranch })
            : ChangesFor.WorkingTree()
          : ChangesFor.Commit({ hash: options.selection.commitHash ?? "" });

  if (options.selection.action === "select-commit" && !options.selection.commitHash) {
    return yield* Effect.die(
      new Error("A commit hash is required when selecting a commit target."),
    );
  }

  const scope =
    options.selection.action === "test-unstaged"
      ? ("unstaged" as const)
      : options.selection.action === "test-changes"
        ? ("changes" as const)
        : options.selection.action === "test-branch"
          ? ("branch" as const)
          : ("commit" as const);

  const [changedFiles, fileStats, diffPreview] = yield* Effect.all([
    git.getChangedFiles(changesFor),
    git.getFileStats(changesFor),
    git.getDiffPreview(changesFor),
  ]);

  const recentCommits =
    scope === "commit" ? [] : mainBranch ? yield* git.getRecentCommits(`${mainBranch}..HEAD`) : [];

  let selectedCommit: TestTarget["selectedCommit"];
  if (scope === "commit") {
    const commitHash = options.selection.commitHash!;
    const summary = yield* git.getCommitSummary(commitHash);
    selectedCommit =
      summary ??
      (options.selection.commitShortHash
        ? {
            hash: commitHash,
            shortHash: options.selection.commitShortHash,
            subject: options.selection.commitSubject ?? "",
          }
        : undefined);
  }

  const displayName =
    scope === "unstaged"
      ? `unstaged changes on ${currentBranch}`
      : scope === "changes"
        ? `changes on ${currentBranch}`
        : scope === "branch"
          ? `branch ${currentBranch}`
          : resolveCommitDisplayName(
              selectedCommit?.shortHash ?? options.selection.commitShortHash,
              selectedCommit?.subject ?? options.selection.commitSubject,
            );

  return {
    changesFor,
    scope,
    cwd,
    currentBranch,
    mainBranch,
    displayName,
    fileStats,
    changedFiles,
    recentCommits: scope === "commit" && selectedCommit ? [selectedCommit] : recentCommits,
    diffPreview,
    selectedCommit,
  } satisfies TestTarget;
});
