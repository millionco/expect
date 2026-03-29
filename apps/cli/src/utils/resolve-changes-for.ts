import { Effect } from "effect";
import { ChangesFor, Git } from "@expect/supervisor";

type Target = "unstaged" | "branch" | "changes";

export const resolveChangesFor = (target: Target) => {
  const cwd = process.cwd();
  return Effect.runPromise(
    Effect.gen(function* () {
      const git = yield* Git;
      const mainBranch = yield* git.getMainBranch;
      const currentBranch = yield* git.getCurrentBranch;

      if (target === "branch") {
        return {
          changesFor: ChangesFor.makeUnsafe({ _tag: "Branch", mainBranch }),
          currentBranch,
        };
      }
      if (target === "changes") {
        return {
          changesFor: ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
          currentBranch,
        };
      }
      return {
        changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
        currentBranch,
      };
    }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
  );
};
