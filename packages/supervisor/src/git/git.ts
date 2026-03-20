import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, ServiceMap } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import * as F from "effect/Function";
import simpleGit from "simple-git";

import {
  type ChangedFile,
  ChangesFor,
  type CommitSummary,
  FileStat,
  GitState,
} from "@browser-tester/shared/models";
import { GitError, FindRepoRootError } from "./errors.js";

// ── GitRepoRoot context service ──────────────────────────────────────

export class GitRepoRoot extends ServiceMap.Service<GitRepoRoot, string>()(
  "@supervisor/GitRepoRoot",
) {}

// ── Git Service ──────────────────────────────────────────────────────

export class Git extends ServiceMap.Service<Git>()("@supervisor/Git", {
  make: Effect.gen(function* () {
    // ── Low-level helpers ────────────────────────────────────

    const raw = (options: { args: string[]; operation: string; trim?: boolean }) =>
      Effect.gen(function* () {
        const repoRoot = yield* GitRepoRoot;
        return yield* Effect.tryPromise({
          try: () => simpleGit(repoRoot).raw(options.args),
          catch: (cause) => new GitError({ operation: options.operation, cause }),
        }).pipe(Effect.map(options.trim ? Str.trim : F.identity));
      });

    // ── Repo root ────────────────────────────────────────────

    const getRepoRoot = (cwd: string) =>
      Effect.tryPromise({
        try: () => simpleGit(cwd).revparse(["--show-toplevel"]),
        catch: (cause) => new FindRepoRootError({ cause }),
      }).pipe(Effect.map(Str.trim));

    const withRepoRoot =
      (cwd: string) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const repoRoot = yield* getRepoRoot(cwd);
          return yield* effect.pipe(Effect.provideService(GitRepoRoot, repoRoot));
        });

    // ── Branch operations ────────────────────────────────────

    const FALLBACK_PRIMARY_BRANCH = "main";

    const getMainBranch = raw({
      args: ["symbolic-ref", "refs/remotes/origin/HEAD"],
      operation: "getting main branch",
      trim: true,
    }).pipe(
      Effect.map((ref) => ref.replace("refs/remotes/origin/", "")),
      Effect.catchTag("GitError", () =>
        raw({
          args: ["revparse", "--verify", "origin/main"],
          operation: "getting main branch (origin/main)",
          trim: true,
        }).pipe(Effect.as("main")),
      ),
      Effect.catchTag("GitError", () =>
        raw({
          args: ["rev-parse", "--verify", "main"],
          operation: "getting main branch (main)",
          trim: true,
        }).pipe(Effect.as("main")),
      ),
      Effect.catchTag("GitError", () => Effect.succeed(FALLBACK_PRIMARY_BRANCH)),
    );

    const getCurrentBranch = raw({
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      operation: "getting current branch",
      trim: true,
    }).pipe(Effect.catchTag("GitError", () => Effect.succeed("HEAD")));

    const isInsideWorkTree = raw({
      args: ["rev-parse", "--is-inside-work-tree"],
      operation: "checking if inside work tree",
      trim: true,
    }).pipe(
      Effect.map((output) => output === "true"),
      Effect.catchTag("GitError", () => Effect.succeed(false)),
    );

    // ── File stats ───────────────────────────────────────────

    const parseFileStatLine = (line: string) => {
      const [added, removed, relativePath] = line.split("\t");
      return new FileStat({
        relativePath: relativePath ?? "",
        added: Number.parseInt(added ?? "0", 10) || 0,
        removed: Number.parseInt(removed ?? "0", 10) || 0,
      });
    };

    const getFileStats = Effect.fn("Git.getFileStats")(function* (changesFor: ChangesFor) {
      if (changesFor._tag === "WorkingTree") {
        return yield* raw({
          args: ["diff", "HEAD", "--numstat"],
          operation: "getting working tree file stats",
        }).pipe(
          Effect.map(Str.split("\n")),
          Effect.map(Arr.map(Str.trim)),
          Effect.map(Arr.filter(Str.isNonEmpty)),
          Effect.map(Arr.map(parseFileStatLine)),
          Effect.catchTag("GitError", () => Effect.succeed([] as FileStat[])),
        );
      }

      const diffRange =
        changesFor._tag === "Branch" || changesFor._tag === "Changes"
          ? `${changesFor.mainBranch}..HEAD`
          : `${changesFor.hash}^..${changesFor.hash}`;

      return yield* raw({
        args: ["diff", diffRange, "--numstat"],
        operation: "getting file stats",
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.map(Str.trim)),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.map(Arr.map(parseFileStatLine)),
        Effect.catchTag("GitError", () => Effect.succeed([] as FileStat[])),
      );
    });

    // ── Changed files (lightweight) ──────────────────────────

    const parseStatusLetter = (letter: string): ChangedFile["status"] => {
      if (letter === "A") return "A";
      if (letter === "D") return "D";
      if (letter === "R") return "R";
      if (letter === "C") return "C";
      if (letter === "?") return "?";
      return "M";
    };

    const getChangedFiles = Effect.fn("Git.getChangedFiles")(function* (changesFor: ChangesFor) {
      if (changesFor._tag === "WorkingTree") {
        return yield* raw({
          args: ["status", "--porcelain"],
          operation: "getting working tree changes",
        }).pipe(
          Effect.map(Str.split("\n")),
          Effect.map(Arr.filter(Str.isNonEmpty)),
          Effect.map(
            Arr.map((line): ChangedFile => {
              const statusLetter = line.at(0) ?? "M";
              const path = line.slice(3).trim();
              return { path, status: parseStatusLetter(statusLetter) };
            }),
          ),
          Effect.catchTag("GitError", () => Effect.succeed([] as ChangedFile[])),
        );
      }

      const diffRange =
        changesFor._tag === "Branch" || changesFor._tag === "Changes"
          ? `${changesFor.mainBranch}..HEAD`
          : `${changesFor.hash}^..${changesFor.hash}`;

      return yield* raw({
        args: ["diff", "--name-status", diffRange],
        operation: "getting changed files",
        trim: true,
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.map(Str.trim)),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.map(
          Arr.map((line): ChangedFile => {
            const parts = line.split("\t");
            const statusLetter = (parts[0] ?? "M").at(0) ?? "M";
            const isRenameOrCopy = statusLetter === "R" || statusLetter === "C";
            const path = (isRenameOrCopy ? parts[2] : parts[1]) ?? "";
            return { path, status: parseStatusLetter(statusLetter) };
          }),
        ),
        Effect.catchTag("GitError", () => Effect.succeed([] as ChangedFile[])),
      );
    });

    // ── Diff preview ─────────────────────────────────────────

    const getDiffPreview = Effect.fn("Git.getDiffPreview")(function* (changesFor: ChangesFor) {
      if (changesFor._tag === "WorkingTree") {
        return yield* raw({
          args: ["diff", "HEAD"],
          operation: "getting diff preview",
          trim: true,
        }).pipe(Effect.catchTag("GitError", () => Effect.succeed("")));
      }

      const diffRange =
        changesFor._tag === "Branch" || changesFor._tag === "Changes"
          ? `${changesFor.mainBranch}..HEAD`
          : `${changesFor.hash}^..${changesFor.hash}`;

      return yield* raw({
        args: ["diff", diffRange],
        operation: "getting diff preview",
        trim: true,
      }).pipe(Effect.catchTag("GitError", () => Effect.succeed("")));
    });

    // ── Recent commits ───────────────────────────────────────

    const getRecentCommits = Effect.fn("Git.getRecentCommits")(function* (range: string) {
      return yield* raw({
        args: ["log", "--format=%H\t%h\t%s", range],
        operation: "getting recent commits",
        trim: true,
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.map(Str.trim)),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.map(
          Arr.map((line): CommitSummary => {
            const [hash, shortHash, ...subjectParts] = line.split("\t");
            return {
              hash: hash ?? "",
              shortHash: shortHash ?? "",
              subject: subjectParts.join("\t"),
            };
          }),
        ),
        Effect.catchTag("GitError", () => Effect.succeed([] as CommitSummary[])),
      );
    });

    const getCommitSummary = Effect.fn("Git.getCommitSummary")(function* (hash: string) {
      return yield* raw({
        args: ["log", "-1", "--format=%H\t%h\t%s", hash],
        operation: "getting commit summary",
        trim: true,
      }).pipe(
        Effect.map((line) => {
          const [fullHash, shortHash, ...subjectParts] = line.split("\t");
          if (!fullHash || !shortHash) return undefined;
          return {
            hash: fullHash,
            shortHash,
            subject: subjectParts.join("\t"),
          } satisfies CommitSummary;
        }),
        Effect.catchTag("GitError", () => Effect.succeed(undefined as CommitSummary | undefined)),
      );
    });

    const getState = Effect.fn("Git.getState")(function* () {
      yield* Effect.logInfo("FOO BAR");
      console.error("getState 1");
      const isInside = yield* isInsideWorkTree;
      yield* Effect.logInfo("FOO BAR 2");
      console.error("getState 2");
      if (!isInside) {
        return new GitState({
          isGitRepo: false,
          currentBranch: "HEAD",
          mainBranch: undefined,
          isOnMain: false,
          hasChangesFromMain: false,
          hasUnstagedChanges: false,
          hasBranchCommits: false,
          branchCommitCount: 0,
          fileStats: [],
        });
      }
      console.error("getState 3");
      yield* Effect.logInfo("FOO BAR3");
      const currentBranch = yield* getCurrentBranch;
      console.error("getState 4");
      const mainBranch = yield* getMainBranch;
      console.error("getState 5");
      const isOnMain = currentBranch === mainBranch;
      console.error("getState 6");
      const branchFileStats = yield* getFileStats(
        ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
      );
      console.error("getState 7");
      const workingTreeFileStats = yield* getFileStats(
        ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      );
      const recentCommits = yield* getRecentCommits(`${mainBranch}..HEAD`);
      return new GitState({
        isGitRepo: true,
        currentBranch,
        mainBranch,
        isOnMain,
        hasChangesFromMain: branchFileStats.length > 0,
        hasUnstagedChanges: workingTreeFileStats.length > 0,
        hasBranchCommits: recentCommits.length > 0,
        branchCommitCount: recentCommits.length,
        fileStats: branchFileStats,
      });
    });

    return {
      withRepoRoot,
      getMainBranch,
      getCurrentBranch,
      isInsideWorkTree,
      getFileStats,
      getChangedFiles,
      getDiffPreview,
      getRecentCommits,
      getCommitSummary,
      getState,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));

  static withRepoRoot = (cwd: string) => {
    const repoRootLayer = Layer.effect(GitRepoRoot)(
      Effect.tryPromise({
        try: () => simpleGit(cwd).revparse(["--show-toplevel"]),
        catch: (cause) => new FindRepoRootError({ cause }),
      }).pipe(Effect.map((root) => root.trim())),
    );
    return Layer.mergeAll(Git.layer.pipe(Layer.provide(repoRootLayer)), repoRootLayer);
  };
}
