import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, ServiceMap } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import * as F from "effect/Function";
import * as crypto from "node:crypto";
import * as path from "node:path";
import simpleGit from "simple-git";

import {
  type ChangedFile,
  ChangesFor,
  type CommitSummary,
  FileStat,
  GitState,
} from "@browser-tester/shared/models";
import { TESTED_FINGERPRINT_FILE, TESTIE_STATE_DIR } from "../constants.js";
import { GitError, FindRepoRootError } from "./errors.js";

// ── GitRepoRoot context service ──────────────────────────────────────

export class GitRepoRoot extends ServiceMap.Service<GitRepoRoot, string>()(
  "@supervisor/GitRepoRoot",
) {}

// ── Git Service ──────────────────────────────────────────────────────

export class Git extends ServiceMap.Service<Git>()("@supervisor/Git", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

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

    // ── Fingerprint ──────────────────────────────────────────

    const NULL_SEPARATOR = "\0";

    const computeFingerprint = Effect.fn("Git.computeFingerprint")(function* () {
      const head = yield* raw({
        args: ["rev-parse", "HEAD"],
        operation: "getting HEAD for fingerprint",
        trim: true,
      }).pipe(Effect.catchTag("GitError", () => Effect.succeed("")));

      if (!head) return undefined;

      const unstaged = yield* raw({
        args: ["diff"],
        operation: "getting unstaged diff for fingerprint",
      }).pipe(Effect.catchTag("GitError", () => Effect.succeed("")));

      const staged = yield* raw({
        args: ["diff", "--cached"],
        operation: "getting staged diff for fingerprint",
      }).pipe(Effect.catchTag("GitError", () => Effect.succeed("")));

      return crypto
        .createHash("sha256")
        .update(head)
        .update(NULL_SEPARATOR)
        .update(unstaged)
        .update(NULL_SEPARATOR)
        .update(staged)
        .digest("hex");
    });

    const getFingerprintPath = Effect.gen(function* () {
      const repoRoot = yield* GitRepoRoot;
      return path.join(repoRoot, TESTIE_STATE_DIR, TESTED_FINGERPRINT_FILE);
    });

    const loadSavedFingerprint = Effect.fn("Git.loadSavedFingerprint")(function* () {
      const fingerprintPath = yield* getFingerprintPath;
      return yield* fileSystem.readFileString(fingerprintPath).pipe(
        Effect.map(Str.trim),
        Effect.catchTag("PlatformError", () => Effect.succeed(undefined as string | undefined)),
      );
    });

    const saveTestedFingerprint = Effect.fn("Git.saveTestedFingerprint")(function* () {
      const fingerprint = yield* computeFingerprint();
      if (!fingerprint) return;

      const fingerprintPath = yield* getFingerprintPath;
      const directory = path.dirname(fingerprintPath);

      yield* fileSystem
        .makeDirectory(directory, { recursive: true })
        .pipe(Effect.catchTag("PlatformError", () => Effect.void));
      yield* fileSystem.writeFileString(fingerprintPath, fingerprint);
    });

    // ── State ─────────────────────────────────────────────────

    const getState = Effect.fn("Git.getState")(function* () {
      const isInside = yield* isInsideWorkTree;
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
          fingerprint: undefined,
          savedFingerprint: undefined,
        });
      }

      const currentBranch = yield* getCurrentBranch;
      const mainBranch = yield* getMainBranch;
      const isOnMain = currentBranch === mainBranch;
      const branchFileStats = yield* getFileStats(
        ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
      );
      const workingTreeFileStats = yield* getFileStats(
        ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      );
      const recentCommits = yield* getRecentCommits(`${mainBranch}..HEAD`);
      const fingerprint = yield* computeFingerprint();
      const savedFingerprint = yield* loadSavedFingerprint();

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
        fingerprint,
        savedFingerprint,
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
      computeFingerprint,
      saveTestedFingerprint,
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
