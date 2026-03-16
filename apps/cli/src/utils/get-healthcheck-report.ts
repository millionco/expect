import type { DiffStats } from "@browser-tester/supervisor";
import {
  categorizeChangedFiles,
  type FileCategory,
} from "./categorize-changed-files.js";
import { type GitState, getRecommendedScope, type TestScope } from "./get-git-state.js";

interface HealthcheckReport {
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
  const hasUntestedChanges = gitState.hasUnstagedChanges || gitState.hasBranchCommits;
  const diffStats = gitState.hasUnstagedChanges ? gitState.diffStats : gitState.branchDiffStats;
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
