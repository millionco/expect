import { Effect } from "effect";
import { ChangesFor, Git } from "@expect/supervisor";

export const DEFAULT_INSTRUCTION =
  "Test all changes from main in the browser and verify they work correctly.";

export type Target = "unstaged" | "branch" | "changes";

export const TARGETS: readonly Target[] = ["unstaged", "branch", "changes"];

export interface ResolvedChangesFor {
  readonly changesFor: ChangesFor;
  readonly currentBranch: string;
}

export const isTarget = (value: string): value is Target =>
  TARGETS.some((target) => target === value);

export const resolveChangesForEffect = Effect.fn("resolveChangesForEffect")(function* (
  target: Target,
) {
  const git = yield* Git;
  const mainBranch = yield* git.getMainBranch;
  const currentBranch = yield* git.getCurrentBranch;

  if (target === "branch") {
    return {
      changesFor: ChangesFor.makeUnsafe({ _tag: "Branch", mainBranch }),
      currentBranch,
    } satisfies ResolvedChangesFor;
  }

  if (target === "changes") {
    return {
      changesFor: ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
      currentBranch,
    } satisfies ResolvedChangesFor;
  }

  return {
    changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
    currentBranch,
  } satisfies ResolvedChangesFor;
});
