import type { FileStat } from "./git/index.js";
import { categorizeChangedFiles, type FileCategory } from "./utils/categorize-changed-files.js";
import { type GitState, getRecommendedScope, type TestScope } from "./get-git-state.js";
import { isCurrentStateTested } from "./tested-state.js";

export interface HealthcheckReport {
  hasUntestedChanges: boolean;
  scope: TestScope;
  changedLines: number;
  fileCount: number;
  categories: FileCategory[];
  totalWebFiles: number;
  fileStats: readonly FileStat[];
  changedFilePaths: string[];
}

export const getHealthcheckReport = (gitState: GitState): HealthcheckReport => {
  const scope = getRecommendedScope(gitState);
  const hasGitChanges =
    gitState.hasChangesFromMain || gitState.hasUnstagedChanges || gitState.hasBranchCommits;
  const hasUntestedChanges = hasGitChanges && !isCurrentStateTested();
  const additions = gitState.fileStats.reduce((sum, stat) => sum + stat.additions, 0);
  const deletions = gitState.fileStats.reduce((sum, stat) => sum + stat.deletions, 0);
  const changedLines = additions + deletions;
  const fileCount = gitState.fileStats.length;
  const { categories, totalWebFiles } = categorizeChangedFiles(gitState.changedFiles);

  return {
    hasUntestedChanges,
    scope,
    changedLines,
    fileCount,
    categories,
    totalWebFiles,
    fileStats: gitState.fileStats,
    changedFilePaths: gitState.changedFiles.map((file) => file.path),
  };
};
