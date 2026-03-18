import { Effect } from "effect";
import { useQuery } from "@tanstack/react-query";
import { Git, type GitState } from "@browser-tester/supervisor";

export type { GitState };

export const useGitState = () =>
  useQuery({
    queryKey: ["git-state"],
    queryFn: (): Promise<GitState> =>
      Effect.runPromise(
        Git.use((git) => git.getState()).pipe(Effect.provide(Git.withRepoRoot(process.cwd()))),
      ),
  });
