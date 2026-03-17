import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { resolveTestTarget } from "../src/resolve-test-target.js";
import {
  ChangedFile,
  ChangesFor,
  CommitSummary,
  FileStat,
  Git,
  GitRepoRoot,
} from "../src/git/index.js";

const createMockGitLayer = (options: {
  currentBranch?: string;
  mainBranch?: string | undefined;
  changedFiles?: Record<string, readonly ChangedFile[]>;
  fileStats?: Record<string, readonly FileStat[]>;
  diffPreviews?: Record<string, string>;
  recentCommits?: Record<string, readonly CommitSummary[]>;
  commitSummary?: Record<string, CommitSummary | undefined>;
}) => {
  const mockGit = Git.of({
    getCurrentBranch: Effect.succeed(options.currentBranch ?? "feature-branch"),
    getMainBranch: Effect.succeed(options.mainBranch),
    getChangedFiles: (changesFor: ChangesFor) =>
      Effect.succeed(options.changedFiles?.[changesFor._tag] ?? []),
    getFileStats: (changesFor: ChangesFor) =>
      Effect.succeed(options.fileStats?.[changesFor._tag] ?? []),
    getDiffPreview: (changesFor: ChangesFor) =>
      Effect.succeed(options.diffPreviews?.[changesFor._tag] ?? ""),
    getRecentCommits: (range?: string) =>
      Effect.succeed(options.recentCommits?.[range ?? "HEAD"] ?? []),
    getCommitSummary: (hash: string) => Effect.succeed(options.commitSummary?.[hash]),
    isInsideWorkTree: Effect.succeed(true),
  });

  return Layer.succeed(Git, mockGit).pipe(
    Layer.provideMerge(Layer.succeed(GitRepoRoot, "/tmp/repo")),
  );
};

describe("resolveTestTarget", () => {
  it("resolves unstaged targets with tracked and untracked context", async () => {
    const layer = createMockGitLayer({
      currentBranch: "feature-branch",
      mainBranch: "main",
      changedFiles: {
        WorkingTree: [
          new ChangedFile({ status: "M", path: "src/app.ts" }),
          new ChangedFile({ status: "D", path: "src/old.ts" }),
          new ChangedFile({ status: "A", path: "src/new-file.ts" }),
        ],
      },
      fileStats: {
        WorkingTree: [
          new FileStat({ path: "src/app.ts", additions: 12, deletions: 3 }),
          new FileStat({ path: "src/new-file.ts", additions: 5, deletions: 0 }),
        ],
      },
      diffPreviews: {
        WorkingTree:
          " src/app.ts | 4 ++--\n src/old.ts | 1 -\n 2 files changed, 2 insertions(+), 3 deletions(-)",
      },
      recentCommits: {
        "main..HEAD": [
          new CommitSummary({
            hash: "abc123",
            shortHash: "a1b2c3",
            subject: "Add onboarding flow",
          }),
        ],
      },
    });

    const target = await Effect.runPromise(
      resolveTestTarget({
        cwd: "/tmp/repo",
        selection: { action: "test-unstaged" },
      }).pipe(Effect.provide(layer)),
    );

    expect(target.scope).toBe("unstaged");
    expect(target.displayName).toBe("unstaged changes on feature-branch");
    expect(target.changedFiles).toEqual([
      { status: "M", path: "src/app.ts" },
      { status: "D", path: "src/old.ts" },
      { status: "A", path: "src/new-file.ts" },
    ]);
    expect(target.fileStats).toHaveLength(2);
  });

  it("resolves branch targets against main", async () => {
    const layer = createMockGitLayer({
      currentBranch: "feature-branch",
      mainBranch: "main",
      changedFiles: {
        Branch: [
          new ChangedFile({ status: "M", path: "src/onboarding.ts" }),
          new ChangedFile({ status: "A", path: "src/import.ts" }),
        ],
      },
      fileStats: {
        Branch: [
          new FileStat({ path: "src/onboarding.ts", additions: 8, deletions: 3 }),
          new FileStat({ path: "src/import.ts", additions: 6, deletions: 0 }),
        ],
      },
      recentCommits: {
        "main..HEAD": [
          new CommitSummary({ hash: "abc123", shortHash: "a1b2c3", subject: "Improve onboarding" }),
          new CommitSummary({ hash: "xyz789", shortHash: "x9y8z7", subject: "Fix project import" }),
        ],
      },
    });

    const target = await Effect.runPromise(
      resolveTestTarget({
        cwd: "/tmp/repo",
        selection: { action: "test-branch" },
      }).pipe(Effect.provide(layer)),
    );

    expect(target.scope).toBe("branch");
    expect(target.mainBranch).toBe("main");
    expect(target.changedFiles).toEqual([
      { status: "M", path: "src/onboarding.ts" },
      { status: "A", path: "src/import.ts" },
    ]);
    expect(target.recentCommits).toHaveLength(2);
  });

  it("resolves commit targets from the selected commit hash", async () => {
    const layer = createMockGitLayer({
      currentBranch: "feature-branch",
      mainBranch: "main",
      changedFiles: {
        Commit: [new ChangedFile({ status: "M", path: "src/onboarding.ts" })],
      },
      fileStats: {
        Commit: [new FileStat({ path: "src/onboarding.ts", additions: 8, deletions: 1 })],
      },
      commitSummary: {
        deadbeef: new CommitSummary({
          hash: "deadbeef",
          shortHash: "deadbee",
          subject: "Fix onboarding import step",
        }),
      },
    });

    const target = await Effect.runPromise(
      resolveTestTarget({
        cwd: "/tmp/repo",
        selection: { action: "select-commit", commitHash: "deadbeef" },
      }).pipe(Effect.provide(layer)),
    );

    expect(target.scope).toBe("commit");
    expect(target.selectedCommit).toEqual({
      hash: "deadbeef",
      shortHash: "deadbee",
      subject: "Fix onboarding import step",
    });
    expect(target.changedFiles).toEqual([{ status: "M", path: "src/onboarding.ts" }]);
  });
});
