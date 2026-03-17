import { execFile } from "node:child_process";
import { Data, Effect } from "effect";
import { GIT_TIMEOUT_MS, GITHUB_TIMEOUT_MS, PR_LIMIT } from "./constants.js";

export interface RemoteBranch {
  name: string;
  author: string;
  prNumber: number | null;
  prStatus: "open" | "draft" | "merged" | null;
  updatedAt: string | null;
}

interface GhPullRequest {
  headRefName: string;
  author: { login: string };
  number: number;
  state: string;
  isDraft: boolean;
  updatedAt: string;
}

class CommandError extends Data.TaggedError("CommandError")<{
  command: string;
  message: string;
}> {}

class GhParseError extends Data.TaggedError("GhParseError")<{
  output: string;
  message: string;
}> {}

const normalizePrStatus = (state: string, isDraft: boolean): "open" | "draft" | "merged" => {
  if (state === "MERGED") return "merged";
  if (isDraft) return "draft";
  return "open";
};

const buildEmptyBranch = (name: string): RemoteBranch => ({
  name,
  author: "",
  prNumber: null,
  prStatus: null,
  updatedAt: null,
});

const execCommand = Effect.fn("execCommand")(function* (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  timeoutMs: number,
) {
  return yield* Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          command,
          [...args],
          { cwd, encoding: "utf-8", timeout: timeoutMs },
          (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout.trim());
          },
        );
      }),
    catch: (error) =>
      new CommandError({
        command: `${command} ${args.join(" ")}`,
        message: error instanceof Error ? error.message : String(error),
      }),
  });
});

const checkGhAvailable = Effect.fn("checkGhAvailable")(function* () {
  yield* execCommand("which", ["gh"], "/", GIT_TIMEOUT_MS);
  return true;
});

const fetchPrs = Effect.fn("fetchPrs")(function* (cwd: string, state: string) {
  const output = yield* execCommand(
    "gh",
    [
      "pr",
      "list",
      "--state",
      state,
      "--limit",
      String(PR_LIMIT),
      "--json",
      "headRefName,author,number,state,isDraft,updatedAt",
    ],
    cwd,
    GITHUB_TIMEOUT_MS,
  );

  return yield* Effect.try({
    try: (): GhPullRequest[] => JSON.parse(output),
    catch: (error) =>
      new GhParseError({
        output,
        message: error instanceof Error ? error.message : String(error),
      }),
  });
});

const getRemoteBranchNames = Effect.fn("getRemoteBranchNames")(function* (cwd: string) {
  const output = yield* execCommand(
    "git",
    ["branch", "-r", "--format=%(refname:short)"],
    cwd,
    GIT_TIMEOUT_MS,
  );

  if (!output) return [] as string[];

  return output
    .split("\n")
    .filter(Boolean)
    .filter((ref) => !ref.includes("HEAD"))
    .map((ref) => ref.replace(/^origin\//, ""));
});

const handlePrFailure = (errorMessage: string) =>
  Effect.log("Failed to fetch PRs", { error: errorMessage }).pipe(
    Effect.map((): GhPullRequest[] => []),
  );

const fetchRemoteBranchesEffect = Effect.fn("fetchRemoteBranches")(function* (cwd: string) {
  const branchNames = yield* getRemoteBranchNames(cwd).pipe(
    Effect.catchTag("CommandError", (error) =>
      Effect.log("Failed to list remote branches", { error: error.message }).pipe(
        Effect.map((): string[] => []),
      ),
    ),
  );

  if (branchNames.length === 0) return [] as RemoteBranch[];

  const ghAvailable = yield* checkGhAvailable().pipe(
    Effect.catchTag("CommandError", () => Effect.succeed(false)),
  );

  if (!ghAvailable) {
    return branchNames.map(buildEmptyBranch);
  }

  // HACK: open PRs are iterated first so they take precedence over merged PRs in the Map
  const [openPrs, mergedPrs] = yield* Effect.all(
    [
      fetchPrs(cwd, "open").pipe(
        Effect.catchTags({
          CommandError: (error) => handlePrFailure(error.message),
          GhParseError: (error) => handlePrFailure(error.message),
        }),
      ),
      fetchPrs(cwd, "merged").pipe(
        Effect.catchTags({
          CommandError: (error) => handlePrFailure(error.message),
          GhParseError: (error) => handlePrFailure(error.message),
        }),
      ),
    ],
    { concurrency: 2 },
  );

  const pullRequestByBranch = new Map<string, GhPullRequest>();
  for (const pullRequest of [...openPrs, ...mergedPrs]) {
    if (!pullRequestByBranch.has(pullRequest.headRefName)) {
      pullRequestByBranch.set(pullRequest.headRefName, pullRequest);
    }
  }

  return branchNames.map((name) => {
    const pullRequest = pullRequestByBranch.get(name);
    if (!pullRequest) return buildEmptyBranch(name);
    return {
      name,
      author: pullRequest.author.login,
      prNumber: pullRequest.number,
      prStatus: normalizePrStatus(pullRequest.state, pullRequest.isDraft),
      updatedAt: pullRequest.updatedAt,
    };
  });
});

export const fetchRemoteBranches = (cwd: string): Promise<RemoteBranch[]> =>
  Effect.runPromise(fetchRemoteBranchesEffect(cwd));
