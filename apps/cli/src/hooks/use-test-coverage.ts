import { Effect, Exit } from "effect";
import { useQuery } from "@tanstack/react-query";
import { ChangesFor, Git, TestCoverage } from "@expect/supervisor";
import type { ChangedFile, TestCoverageReport } from "@expect/shared/models";
import type { GitState } from "@expect/shared/models";
import { NodeServices } from "@effect/platform-node";
import { TEST_COVERAGE_TIMEOUT_MS } from "../constants";

const deduplicateChangedFiles = (files: ChangedFile[]): ChangedFile[] => {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
};

export const useTestCoverage = (gitState: GitState | undefined) =>
  useQuery({
    queryKey: ["test-coverage", gitState?.fingerprint],
    queryFn: async (): Promise<TestCoverageReport | undefined> => {
      if (!gitState?.isGitRepo || !gitState.hasUntestedChanges) return undefined;

      const mainBranch = gitState.mainBranch ?? "main";

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const git = yield* Git;
          const testCoverage = yield* TestCoverage;

          const workingTreeFiles = yield* git.getChangedFiles(
            ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
          );
          const branchFiles = yield* git.getChangedFiles(
            ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
          );

          const allChanged = deduplicateChangedFiles([...workingTreeFiles, ...branchFiles]);
          if (allChanged.length === 0) return undefined;

          return yield* testCoverage.analyze(allChanged);
        }).pipe(
          Effect.provide(Git.withRepoRoot(process.cwd())),
          Effect.provide(TestCoverage.layer),
          Effect.timeoutOrElse({
            duration: TEST_COVERAGE_TIMEOUT_MS,
            onTimeout: () => Effect.succeed(undefined),
          }),
          Effect.provide(NodeServices.layer),
        ),
      );

      if (Exit.isSuccess(exit)) return exit.value;
      return undefined;
    },
    enabled: Boolean(gitState?.isGitRepo && gitState.hasUntestedChanges),
    staleTime: 30_000,
  });
