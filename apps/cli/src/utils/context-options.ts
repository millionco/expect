import { Effect } from "effect";
import { Git, Github, type CommitSummary } from "@browser-tester/supervisor";
import {
  TestContext,
  testContextFilterText,
  testContextLabel,
  testContextDescription,
  testContextDisplayLabel,
  type GitState,
  type RemoteBranch,
  type TestContext as TestContextType,
} from "@browser-tester/shared/models";

// HACK: Github.layer leaves `undefined` in R due to Effect v4 beta ServiceMap type inference
const withGithub = <A, E>(effect: Effect.Effect<A, E, Github | undefined>) =>
  effect.pipe(Effect.provide(Github.layer)) as Effect.Effect<A, E>;

export const buildLocalContextOptions = async (gitState: GitState): Promise<TestContextType[]> => {
  const options: TestContextType[] = [];

  if (gitState.hasUntestedChanges) {
    options.push(TestContext.makeUnsafe({ _tag: "WorkingTree" }));
  }

  if (gitState.mainBranch) {
    const cwd = process.cwd();
    const commits: CommitSummary[] = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* Git;
        return yield* git.getRecentCommits(`${gitState.mainBranch}..HEAD`);
      }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
    );
    for (const commit of commits) {
      options.push(
        TestContext.makeUnsafe({
          _tag: "Commit",
          hash: commit.hash,
          shortHash: commit.shortHash,
          subject: commit.subject,
        }),
      );
    }
  }

  return options;
};

export const fetchRemoteBranches = (cwd: string): Promise<RemoteBranch[]> =>
  Effect.runPromise(withGithub(Github.use((github) => github.listPullRequests(cwd))));

export const fetchRemoteContextOptions = async (gitState: GitState): Promise<TestContextType[]> => {
  const cwd = process.cwd();
  const remoteBranches = await fetchRemoteBranches(cwd);

  const openPrs = remoteBranches
    .filter((branch) => branch.prNumber !== null && branch.prStatus === "open")
    .map((branch) => TestContext.makeUnsafe({ _tag: "PullRequest", branch }));
  const mergedPrs = remoteBranches
    .filter((branch) => branch.prNumber !== null && branch.prStatus === "merged")
    .slice(0, 5)
    .map((branch) => TestContext.makeUnsafe({ _tag: "PullRequest", branch }));
  const branchContexts = remoteBranches
    .filter((branch) => branch.name !== gitState.currentBranch && branch.prNumber === null)
    .map((branch) => TestContext.makeUnsafe({ _tag: "Branch", branch }));

  return [...openPrs, ...mergedPrs, ...branchContexts];
};

export const getContextLabel = (context: TestContextType, gitState?: GitState | null): string => {
  if (context._tag === "WorkingTree" && gitState && !gitState.isOnMain) {
    return gitState.currentBranch;
  }
  return testContextLabel(context);
};

export const getContextDescription = (
  context: TestContextType,
  gitState?: GitState | null,
): string => {
  if (context._tag === "WorkingTree" && gitState) {
    const parts: string[] = [];
    if (gitState.branchCommitCount > 0) {
      parts.push(
        `${gitState.branchCommitCount} commit${gitState.branchCommitCount === 1 ? "" : "s"}`,
      );
    }
    if (gitState.fileStats.length > 0) {
      parts.push(`${gitState.fileStats.length} file${gitState.fileStats.length === 1 ? "" : "s"}`);
    }
    if (gitState.hasUnstagedChanges) {
      parts.push("uncommitted changes");
    }
    if (parts.length > 0) return parts.join(", ");
  }
  return testContextDescription(context);
};

export const getContextDisplayLabel = (
  context: TestContextType,
  gitState?: GitState | null,
): string => {
  if (context._tag === "WorkingTree") return getContextLabel(context, gitState);
  return testContextDisplayLabel(context);
};

export const filterContextOptions = (
  options: readonly TestContextType[],
  query: string,
  gitState?: GitState | null,
): TestContextType[] => {
  if (!query) return [...options];
  const lowercaseQuery = query.toLowerCase();
  return options.filter((option) => {
    const text =
      option._tag === "WorkingTree"
        ? `local changes ${gitState?.currentBranch ?? ""}`
        : testContextFilterText(option);
    return text.toLowerCase().includes(lowercaseQuery);
  });
};
