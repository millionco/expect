import { Effect } from "effect";
import type { ChangedFile, FileStat } from "./git/index.js";
import { ChangesFor, Git } from "./git/index.js";

export interface GitState {
  isGitRepo: boolean;
  currentBranch: string;
  mainBranch: string | undefined;
  isOnMain: boolean;
  hasUnstagedChanges: boolean;
  hasBranchCommits: boolean;
  branchCommitCount: number;
  hasChangesFromMain: boolean;
  fileStats: readonly FileStat[];
  changedFiles: readonly ChangedFile[];
}

export type TestScope = "unstaged-changes" | "entire-branch" | "changes" | "default";

const NOT_A_GIT_REPO: GitState = {
  isGitRepo: false,
  currentBranch: "unknown",
  mainBranch: undefined,
  isOnMain: false,
  hasUnstagedChanges: false,
  hasBranchCommits: false,
  branchCommitCount: 0,
  hasChangesFromMain: false,
  fileStats: [],
  changedFiles: [],
};

export const getGitStateEffect = Effect.fn("getGitState")(function* () {
  const git = yield* Git;
  const isGitRepo = yield* git.isInsideWorkTree;
  if (!isGitRepo) return NOT_A_GIT_REPO;

  const currentBranch = yield* git.getCurrentBranch;
  const mainBranch = yield* git.getMainBranch;
  const isOnMain = mainBranch === currentBranch;

  const unstagedStats = yield* git.getFileStats(ChangesFor.WorkingTree());
  const hasUnstagedChanges = unstagedStats.length > 0;

  let branchCommitCount = 0;
  if (!isOnMain && mainBranch) {
    const commits = yield* git.getRecentCommits(`${mainBranch}..HEAD`);
    branchCommitCount = commits.length;
  }

  const changesFor = mainBranch ? ChangesFor.Changes({ mainBranch }) : ChangesFor.WorkingTree();

  const fileStats = yield* git.getFileStats(changesFor);
  const hasChangesFromMain = fileStats.length > 0;

  const changedFiles = hasChangesFromMain
    ? yield* git.getChangedFiles(changesFor)
    : hasUnstagedChanges
      ? yield* git.getChangedFiles(ChangesFor.WorkingTree())
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
    fileStats,
    changedFiles,
  } satisfies GitState;
});

export const getGitState = (cwd: string = process.cwd()): Promise<GitState> =>
  Effect.runPromise(
    getGitStateEffect.pipe(
      Effect.provide(Git.withRepoRoot(cwd)),
      Effect.catchTag("GitError", () => Effect.succeed(NOT_A_GIT_REPO)),
    ),
  );

export const getRecommendedScope = (gitState: GitState): TestScope => {
  if (gitState.hasChangesFromMain) return "changes";
  if (gitState.hasUnstagedChanges) return "unstaged-changes";
  if (!gitState.isOnMain && gitState.hasBranchCommits) return "entire-branch";
  return "default";
};
