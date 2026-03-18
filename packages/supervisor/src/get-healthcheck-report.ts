import type { DiffStats } from "./types";
import { categorizeChangedFiles, type FileCategory } from "./utils/categorize-changed-files";
import { type GitState, getRecommendedScope, type TestScope } from "./get-git-state";
import { isCurrentStateTested } from "./tested-state";

export interface HealthcheckReport {
  hasUntestedChanges: boolean;
  scope: TestScope;
  changedLines: number;
  fileCount: number;
  categories: FileCategory[];
  totalWebFiles: number;
  diffStats: DiffStats | null;
  changedFilePaths: string[];
}

export const getHealthcheckReport = (gitState: GitState): HealthcheckReport => {
  const scope = getRecommendedScope(gitState);
  const hasGitChanges =
    gitState.hasChangesFromMain || gitState.hasUnstagedChanges || gitState.hasBranchCommits;
  const hasUntestedChanges = hasGitChanges && !isCurrentStateTested();
  const diffStats =
    gitState.changesFromMainDiffStats ?? gitState.diffStats ?? gitState.branchDiffStats;
  const changedLines = (diffStats?.additions ?? 0) + (diffStats?.deletions ?? 0);
  const fileCount = diffStats?.filesChanged ?? 0;
  const { categories, totalWebFiles } = categorizeChangedFiles(gitState.changedFiles);

  return {
    hasUntestedChanges,
    scope,
    changedLines,
    fileCount,
    categories,
    totalWebFiles,
    diffStats,
    changedFilePaths: gitState.changedFiles.map((file) => file.path),
  };
};
