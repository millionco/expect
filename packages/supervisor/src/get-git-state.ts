import type { ChangedFile, DiffStats } from "./types";
import {
  getBranchCommits,
  getBranchDiffStats,
  getChangesFromMainChangedFiles,
  getChangesFromMainDiffStats,
  getCurrentBranchName,
  getMainBranchName,
  getUnstagedChangedFiles,
  getUnstagedDiffStats,
  isInsideGitRepo,
} from "./git";

export interface GitState {
  isGitRepo: boolean;
  currentBranch: string;
  mainBranch: string | null;
  isOnMain: boolean;
  hasUnstagedChanges: boolean;
  hasBranchCommits: boolean;
  branchCommitCount: number;
  hasChangesFromMain: boolean;
  diffStats: DiffStats | null;
  branchDiffStats: DiffStats | null;
  changesFromMainDiffStats: DiffStats | null;
  changedFiles: ChangedFile[];
}

export type TestScope = "unstaged-changes" | "entire-branch" | "changes" | "default";

export const getGitState = (cwd: string = process.cwd()): GitState => {
  if (!isInsideGitRepo(cwd)) {
    return {
      isGitRepo: false,
      currentBranch: "unknown",
      mainBranch: null,
      isOnMain: false,
      hasUnstagedChanges: false,
      hasBranchCommits: false,
      branchCommitCount: 0,
      hasChangesFromMain: false,
      diffStats: null,
      branchDiffStats: null,
      changesFromMainDiffStats: null,
      changedFiles: [],
    };
  }

  const currentBranch = getCurrentBranchName(cwd);
  const mainBranch = getMainBranchName(cwd);
  const isOnMain = mainBranch === currentBranch;
  const diffStats = getUnstagedDiffStats(cwd);
  const hasUnstagedChanges = diffStats !== null;

  let branchDiffStats: DiffStats | null = null;
  let branchCommitCount = 0;
  if (!isOnMain && mainBranch) {
    branchCommitCount = getBranchCommits(cwd, mainBranch).length;
    branchDiffStats = getBranchDiffStats(cwd, mainBranch);
  }

  const changesFromMainDiffStats = mainBranch
    ? getChangesFromMainDiffStats(cwd, mainBranch)
    : diffStats;
  const hasChangesFromMain = changesFromMainDiffStats !== null;

  const changedFiles = mainBranch
    ? getChangesFromMainChangedFiles(cwd, mainBranch)
    : hasUnstagedChanges
      ? getUnstagedChangedFiles(cwd)
      : [];

  return {
    isGitRepo: true,
    currentBranch,
    mainBranch,
    isOnMain,
    hasUnstagedChanges,
    hasBranchCommits: branchCommitCount > 0,
    branchCommitCount,
    hasChangesFromMain,
    diffStats,
    branchDiffStats,
    changesFromMainDiffStats,
    changedFiles,
  };
};

export const getRecommendedScope = (gitState: GitState): TestScope => {
  if (gitState.hasChangesFromMain) return "changes";
  if (gitState.hasUnstagedChanges) return "unstaged-changes";
  if (!gitState.isOnMain && gitState.hasBranchCommits) return "entire-branch";
  return "default";
};
