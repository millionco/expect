import { Effect } from "effect";
import {
  fetchRemoteBranches,
  getPullRequestForBranch,
  Git,
  type CommitSummary,
  type RemoteBranch,
  type TestAction,
} from "@browser-tester/supervisor";
import type { GitState } from "@browser-tester/supervisor";

export interface ContextOption {
  id: string;
  type: "changes" | "pr" | "branch" | "commit";
  label: string;
  description: string;
  filterText: string;
  action: TestAction;
  branchName?: string;
  prNumber?: number;
  prStatus?: "open" | "draft" | "merged";
  commitHash?: string;
  commitShortHash?: string;
  commitSubject?: string;
}

const buildChangesOption = async (gitState: GitState): Promise<ContextOption | null> => {
  if (!gitState.hasChangesFromMain && !gitState.hasUnstagedChanges) return null;

  const cwd = process.cwd();
  const pullRequest = gitState.isOnMain
    ? null
    : await getPullRequestForBranch(cwd, gitState.currentBranch);

  const fileCount = gitState.fileStats.length;
  const parts: string[] = [];
  if (pullRequest) {
    parts.push(`#${pullRequest.number}`);
  }
  if (gitState.branchCommitCount > 0) {
    parts.push(
      `${gitState.branchCommitCount} commit${gitState.branchCommitCount === 1 ? "" : "s"}`,
    );
  }
  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
  }
  if (gitState.hasUnstagedChanges) {
    parts.push("uncommitted changes");
  }

  return {
    id: "changes",
    type: "changes",
    label: gitState.isOnMain ? "Local changes" : gitState.currentBranch,
    description: parts.length > 0 ? parts.join(", ") : "working tree",
    filterText: `local changes ${gitState.currentBranch}`,
    action: "test-changes",
    prNumber: pullRequest?.number,
  };
};

const buildBranchOptions = (
  remoteBranches: RemoteBranch[],
  currentBranch: string,
): ContextOption[] =>
  remoteBranches
    .filter((branch) => branch.name !== currentBranch)
    .filter((branch) => branch.prNumber === null)
    .map((branch) => ({
      id: `branch-${branch.name}`,
      type: "branch" as const,
      label: branch.name,
      description: branch.author ? `by ${branch.author}` : "",
      filterText: branch.name,
      action: "test-branch" as const,
      branchName: branch.name,
    }));

const buildPrOptions = (remoteBranches: RemoteBranch[]): ContextOption[] =>
  remoteBranches
    .filter((branch) => branch.prNumber !== null)
    .map((branch) => ({
      id: `pr-${branch.prNumber}`,
      type: "pr" as const,
      label: branch.name,
      description: `#${branch.prNumber} ${branch.prStatus ?? ""}`.trim(),
      filterText: `#${branch.prNumber} ${branch.name} ${branch.author}`,
      action: "test-branch" as const,
      branchName: branch.name,
      prNumber: branch.prNumber ?? undefined,
      prStatus: branch.prStatus ?? undefined,
    }));

const buildCommitOptions = async (gitState: GitState): Promise<ContextOption[]> => {
  if (!gitState.mainBranch) return [];
  const cwd = process.cwd();
  const commits: CommitSummary[] = await Effect.runPromise(
    Effect.gen(function* () {
      const git = yield* Git;
      return yield* git.getRecentCommits(`${gitState.mainBranch}..HEAD`);
    }).pipe(
      Effect.provide(Git.withRepoRoot(cwd)),
      Effect.catchTag("GitError", () => Effect.succeed([] as CommitSummary[])),
    ),
  );
  return commits.map((commit) => ({
    id: `commit-${commit.hash}`,
    type: "commit" as const,
    label: commit.shortHash,
    description: commit.subject,
    filterText: `${commit.shortHash} ${commit.subject}`,
    action: "select-commit" as const,
    commitHash: commit.hash,
    commitShortHash: commit.shortHash,
    commitSubject: commit.subject,
  }));
};

export interface FetchContextOptionsResult {
  options: ContextOption[];
  isLoading: boolean;
}

export const buildLocalContextOptions = async (gitState: GitState): Promise<ContextOption[]> => {
  const options: ContextOption[] = [];
  const changesOption = await buildChangesOption(gitState);
  if (changesOption) options.push(changesOption);

  const commitOptions = await buildCommitOptions(gitState);
  options.push(...commitOptions);

  return options;
};

export const fetchRemoteContextOptions = async (gitState: GitState): Promise<ContextOption[]> => {
  const cwd = process.cwd();
  const remoteBranches = await fetchRemoteBranches(cwd);

  const prOptions = buildPrOptions(remoteBranches);
  const openPrs = prOptions.filter((option) => option.prStatus === "open");
  const mergedPrs = prOptions.filter((option) => option.prStatus === "merged").slice(0, 5);
  const branchOptions = buildBranchOptions(remoteBranches, gitState.currentBranch);

  return [...openPrs, ...mergedPrs, ...branchOptions];
};

export const filterContextOptions = (options: ContextOption[], query: string): ContextOption[] => {
  if (!query) return options;
  const lowercaseQuery = query.toLowerCase();
  return options.filter((option) => option.filterText.toLowerCase().includes(lowercaseQuery));
};
