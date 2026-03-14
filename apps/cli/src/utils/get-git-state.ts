import { execSync } from "child_process";
import { GIT_TIMEOUT_MS } from "../constants.js";

export interface DiffStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface GitState {
  currentBranch: string;
  isOnMain: boolean;
  hasUnstagedChanges: boolean;
  hasBranchCommits: boolean;
  diffStats: DiffStats | null;
  branchDiffStats: DiffStats | null;
}

export type TestScope = "unstaged-changes" | "select-commit" | "entire-branch" | "select-branch";

const MAIN_BRANCH_NAMES = ["main", "master"];

const execGit = (command: string): string | null => {
  try {
    return execSync(command, { encoding: "utf-8", timeout: GIT_TIMEOUT_MS }).trim();
  } catch {
    return null;
  }
};

const parseDiffShortstat = (shortstat: string): DiffStats | null => {
  if (!shortstat) return null;

  const filesMatch = shortstat.match(/(\d+) files? changed/);
  const additionsMatch = shortstat.match(/(\d+) insertions?/);
  const deletionsMatch = shortstat.match(/(\d+) deletions?/);

  if (!filesMatch) return null;

  return {
    filesChanged: Number.parseInt(filesMatch[1], 10),
    additions: additionsMatch ? Number.parseInt(additionsMatch[1], 10) : 0,
    deletions: deletionsMatch ? Number.parseInt(deletionsMatch[1], 10) : 0,
  };
};

const getMainBranchName = (): string | null => {
  for (const name of MAIN_BRANCH_NAMES) {
    const result = execGit(`git rev-parse --verify ${name}`);
    if (result) return name;
  }
  return null;
};

const getUntrackedStats = (): { fileCount: number; lineCount: number } => {
  const output = execGit("git ls-files --others --exclude-standard");
  if (!output) return { fileCount: 0, lineCount: 0 };

  const files = output.split("\n").filter(Boolean);
  if (files.length === 0) return { fileCount: 0, lineCount: 0 };

  const lineOutput = execGit(
    "git ls-files --others --exclude-standard -z | xargs -0 wc -l 2>/dev/null | tail -1",
  );
  let lineCount = 0;
  if (lineOutput) {
    const match = lineOutput.match(/(\d+)/);
    if (match) lineCount = Number.parseInt(match[1], 10);
  }

  return { fileCount: files.length, lineCount };
};

const mergeDiffStats = (
  tracked: DiffStats | null,
  untracked: { fileCount: number; lineCount: number },
): DiffStats | null => {
  if (!tracked && untracked.fileCount === 0) return null;

  return {
    filesChanged: (tracked?.filesChanged ?? 0) + untracked.fileCount,
    additions: (tracked?.additions ?? 0) + untracked.lineCount,
    deletions: tracked?.deletions ?? 0,
  };
};

export const getGitState = (): GitState => {
  const currentBranch = execGit("git rev-parse --abbrev-ref HEAD") ?? "unknown";
  const isOnMain = MAIN_BRANCH_NAMES.includes(currentBranch);
  const shortstat = execGit("git diff --shortstat");
  const trackedDiffStats = shortstat ? parseDiffShortstat(shortstat) : null;
  const untrackedStats = getUntrackedStats();
  const diffStats = mergeDiffStats(trackedDiffStats, untrackedStats);
  const hasUnstagedChanges = diffStats !== null;

  let branchDiffStats: DiffStats | null = null;
  let hasBranchCommits = false;
  if (!isOnMain) {
    const mainBranch = getMainBranchName();
    if (mainBranch) {
      const commitCount = execGit(`git rev-list --count ${mainBranch}..HEAD`);
      hasBranchCommits = Boolean(commitCount && Number.parseInt(commitCount, 10) > 0);
      const branchShortstat = execGit(`git diff ${mainBranch}...HEAD --shortstat`);
      branchDiffStats = branchShortstat ? parseDiffShortstat(branchShortstat) : null;
    }
  }

  return {
    currentBranch,
    isOnMain,
    hasUnstagedChanges,
    hasBranchCommits,
    diffStats,
    branchDiffStats,
  };
};

export const getRecommendedScope = (gitState: GitState): TestScope => {
  if (gitState.isOnMain) {
    return gitState.hasUnstagedChanges ? "unstaged-changes" : "select-commit";
  }
  if (gitState.hasUnstagedChanges) return "unstaged-changes";
  return gitState.hasBranchCommits ? "entire-branch" : "select-branch";
};
