import { Effect, Exit } from "effect";
import { useQuery } from "@tanstack/react-query";
import { Git, type GitState } from "@browser-tester/supervisor";

export type { GitState };

export const useGitState = () =>
  useQuery({
    queryKey: ["git-state"],
    queryFn: async (): Promise<GitState> => {
      console.error("[use-git-state] fetching git state...");
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const git = yield* Git;
          console.error("[use-git-state] got git service, typeof getState:", typeof git.getState);
          console.error(git);
          const result = yield* git.getState();
          console.log("RESU");
          console.log(result);
          return result;
        }).pipe(Effect.provide(Git.withRepoRoot(process.cwd()))),
      );
      if (Exit.isSuccess(exit)) {
        console.error("[use-git-state] got state:", {
          isGitRepo: exit.value.isGitRepo,
          branch: exit.value.currentBranch,
          fileStats: exit.value.fileStats.length,
        });
        return exit.value;
      }
      console.error("[use-git-state] FAILED:", exit.cause);
      throw exit.cause;
    },
  });
