import {
  getBranchChangedFiles,
  getBranchCommits,
  getBranchDiffPreview,
  getBranchDiffStats,
  getChangesFromMainChangedFiles,
  getChangesFromMainDiffPreview,
  getChangesFromMainDiffStats,
  getCommitChangedFiles,
  getCommitDiffPreview,
  getCommitDiffStats,
  getCommitSummary,
  getCurrentBranchName,
  getMainBranchName,
  getUnstagedChangedFiles,
  getUnstagedDiffPreview,
  getUnstagedDiffStats,
} from "./git";
import { ensureSafeCurrentWorkingDirectory } from "@browser-tester/utils";
import type { ResolveTestTargetOptions, TestTarget } from "./types";

const resolveCommitDisplayName = (commitShortHash?: string, commitSubject?: string): string => {
  if (commitShortHash && commitSubject) return `commit ${commitShortHash} (${commitSubject})`;
  if (commitShortHash) return `commit ${commitShortHash}`;
  return "selected commit";
};

export const resolveTestTarget = (options: ResolveTestTargetOptions): TestTarget => {
  const cwd = ensureSafeCurrentWorkingDirectory(options.cwd);
  const currentBranchName = getCurrentBranchName(cwd);
  const mainBranchName = getMainBranchName(cwd);

  if (options.selection.action === "test-unstaged") {
    return {
      scope: "unstaged",
      cwd,
      branch: {
        current: currentBranchName,
        main: mainBranchName,
      },
      displayName: `unstaged changes on ${currentBranchName}`,
      diffStats: getUnstagedDiffStats(cwd),
      branchDiffStats: mainBranchName ? getBranchDiffStats(cwd, mainBranchName) : null,
      changedFiles: getUnstagedChangedFiles(cwd),
      recentCommits: mainBranchName ? getBranchCommits(cwd, mainBranchName) : [],
      diffPreview: getUnstagedDiffPreview(cwd),
    };
  }

  if (options.selection.action === "test-changes") {
    return {
      scope: "changes",
      cwd,
      branch: {
        current: currentBranchName,
        main: mainBranchName,
      },
      displayName: `changes on ${currentBranchName}`,
      diffStats: mainBranchName
        ? getChangesFromMainDiffStats(cwd, mainBranchName)
        : getUnstagedDiffStats(cwd),
      branchDiffStats: mainBranchName ? getBranchDiffStats(cwd, mainBranchName) : null,
      changedFiles: mainBranchName
        ? getChangesFromMainChangedFiles(cwd, mainBranchName)
        : getUnstagedChangedFiles(cwd),
      recentCommits: mainBranchName ? getBranchCommits(cwd, mainBranchName) : [],
      diffPreview: mainBranchName
        ? getChangesFromMainDiffPreview(cwd, mainBranchName)
        : getUnstagedDiffPreview(cwd),
    };
  }

  if (options.selection.action === "test-branch") {
    return {
      scope: "branch",
      cwd,
      branch: {
        current: currentBranchName,
        main: mainBranchName,
      },
      displayName: `branch ${currentBranchName}`,
      diffStats: mainBranchName ? getBranchDiffStats(cwd, mainBranchName) : null,
      branchDiffStats: mainBranchName ? getBranchDiffStats(cwd, mainBranchName) : null,
      changedFiles: mainBranchName ? getBranchChangedFiles(cwd, mainBranchName) : [],
      recentCommits: mainBranchName ? getBranchCommits(cwd, mainBranchName) : [],
      diffPreview: mainBranchName ? getBranchDiffPreview(cwd, mainBranchName) : "",
    };
  }

  const commitHash = options.selection.commitHash;
  if (!commitHash) throw new Error("A commit hash is required when selecting a commit target.");

  const selectedCommit =
    getCommitSummary(cwd, commitHash) ??
    (options.selection.commitShortHash
      ? {
          hash: commitHash,
          shortHash: options.selection.commitShortHash,
          subject: options.selection.commitSubject ?? "",
        }
      : null);

  return {
    scope: "commit",
    cwd,
    branch: {
      current: currentBranchName,
      main: mainBranchName,
    },
    displayName: resolveCommitDisplayName(
      selectedCommit?.shortHash ?? options.selection.commitShortHash,
      selectedCommit?.subject ?? options.selection.commitSubject,
    ),
    diffStats: getCommitDiffStats(cwd, commitHash),
    branchDiffStats: mainBranchName ? getBranchDiffStats(cwd, mainBranchName) : null,
    changedFiles: getCommitChangedFiles(cwd, commitHash),
    recentCommits: selectedCommit ? [selectedCommit] : [],
    diffPreview: getCommitDiffPreview(cwd, commitHash),
    selectedCommit: selectedCommit ?? undefined,
  };
};
