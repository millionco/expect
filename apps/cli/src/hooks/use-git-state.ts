import { Effect, Exit } from "effect";
import { useQuery } from "@tanstack/react-query";
import { Git, GitState } from "@expect/supervisor";
import { GIT_STATE_TIMEOUT_MS } from "../constants";
import { NodeServices } from "@effect/platform-node";

export type { GitState };

const NON_GIT_STATE = new GitState({
  isGitRepo: false,
  currentBranch: "HEAD",
  mainBranch: undefined,
  isOnMain: false,
  hasChangesFromMain: false,
  hasUnstagedChanges: false,
  hasBranchCommits: false,
  branchCommitCount: 0,
  fileStats: [],
  fingerprint: undefined,
  savedFingerprint: undefined,
});

export const useGitState = () =>
  useQuery({
    queryKey: ["git-state"],
    queryFn: async (): Promise<GitState> => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const git = yield* Git;
          return yield* git.getState();
        }).pipe(
          Effect.provide(Git.withRepoRoot(process.cwd())),
          Effect.catchTag("FindRepoRootError", () => Effect.succeed(NON_GIT_STATE)),
          Effect.timeoutOrElse({
            duration: GIT_STATE_TIMEOUT_MS,
            onTimeout: () => Effect.succeed(NON_GIT_STATE),
          }),
          Effect.provide(NodeServices.layer),
        ),
      );
      if (Exit.isSuccess(exit)) {
        return exit.value;
      }
      return NON_GIT_STATE;
    },
  });
