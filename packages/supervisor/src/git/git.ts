import * as os from "node:os";
import * as Path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { applyPatch, parsePatch, reversePatch } from "diff";
import { Data, Effect, Layer, Match, Option, ServiceMap } from "effect";
import * as Arr from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import * as F from "effect/Function";
import * as Str from "effect/String";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import simpleGit, { type SimpleGit } from "simple-git";

import {
  Branch,
  CommitHash,
  FileStat,
  GitError,
  FindRepoRootError,
  IndexChange,
  WorkingTreeChange,
  CommittedChange,
  Absent,
  Binary,
  Text,
  Diff,
  DiffValue,
  TaskRepoAlreadyExistsError,
  TaskRepoCreateError,
} from "@ami/shared/models";

import type { ChangeType, FileContent, GitFileStatus, TaskId } from "@ami/shared/models";

// ── Constants ────────────────────────────────────────────────────────

const ROBUST_DIFF_FLAGS = ["--no-ext-diff", "--no-color"] as const;
const FALLBACK_PRIMARY_BRANCH = "main";
const BINARY_SCAN_LIMIT = 8_000;
const BRANCH_REF_FORMAT =
  "%(refname:short)\t%(refname)\t%(authorname)\t%(authoremail)\t%(subject)\t%(committerdate:unix)";
const COMMIT_TIMESTAMP_MS_MULTIPLIER = 1_000;
const TASKS_DIR = Path.join(os.homedir(), ".ami-next", "tasks");

// ── Helpers ──────────────────────────────────────────────────────────

const emptyToUndefined = (value: string | undefined) =>
  value && value.length > 0 ? value : undefined;

const DEFAULT_LIST_BRANCHES_LIMIT = 100;

export type ChangesFor = Data.TaggedEnum<{
  WorkingTree: {};
  Branch: { branchName: string; base: string };
  Commit: { hash: CommitHash };
}>;
export const ChangesFor = Data.taggedEnum<ChangesFor>();

export type MergeStrategy = Data.TaggedEnum<{
  SquashMerge: {};
}>;
export const MergeStrategy = Data.taggedEnum<MergeStrategy>();

const looksLikeBinary = (content: string) => {
  const limit = Math.min(content.length, BINARY_SCAN_LIMIT);
  for (let i = 0; i < limit; i++) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
};

type GitStatusLetter = "M" | "A" | "D" | "T" | "R" | "C" | "U" | "?";
const parseGitStatusLetter = (letter: GitStatusLetter): GitFileStatus => {
  if (letter === "M") return "Modified";
  if (letter === "A") return "Added";
  if (letter === "D") return "Deleted";
  if (letter === "T") return "TypeChanged";
  if (letter === "R") return "Renamed";
  if (letter === "C") return "Copied";
  if (letter === "U") return "Unmerged";
  if (letter === "?") return "Untracked";
  throw new Error(`Invalid git status letter: ${letter}`);
};

const unsafeParseGitStatusLetter = (letter: string): GitFileStatus | undefined => {
  if (letter === "M") return "Modified";
  if (letter === "A") return "Added";
  if (letter === "D") return "Deleted";
  if (letter === "T") return "TypeChanged";
  if (letter === "R") return "Renamed";
  if (letter === "C") return "Copied";
  if (letter === "U") return "Unmerged";
  if (letter === "?") return "Untracked";
  if (letter === " ") return undefined;
  throw new Error(`Invalid git status letter: ${letter}`);
};

const stripOriginPrefix = (name: string) =>
  name.startsWith("origin/") ? name.slice("origin/".length) : name;

// ── MergeConflictError ───────────────────────────────────────────────

export { GitError, FindRepoRootError } from "@ami/shared/models";

// ── GitRepoRoot context service ──────────────────────────────────────

export const GitRepoRoot: ServiceMap.Service<string, string> = ServiceMap.Service("GitRepoRoot");

// ── Git Service ──────────────────────────────────────────────────────

export class Git extends ServiceMap.Service<Git>()("@ami/Git", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(TASKS_DIR, { recursive: true });
    const spawner = yield* ChildProcessSpawner;

    // ── Low-level helpers ────────────────────────────────────

    const raw = (options: { args: string[]; operation: string; trim?: boolean }) =>
      Effect.gen(function* () {
        const repoRoot = yield* GitRepoRoot;
        return yield* Effect.tryPromise({
          try: () => simpleGit(repoRoot).raw(options.args),
          catch: (cause) => new GitError({ operation: options.operation, cause }),
        }).pipe(
          Effect.map(options.trim ? Str.trim : F.identity),
          Effect.withSpan("Git.raw", {
            attributes: { cwd: repoRoot, command: options.args.join(" ") },
          }),
        );
      });

    const git = <A>(fn: (simpleGit: SimpleGit) => Promise<A>, options: { operation: string }) =>
      Effect.gen(function* () {
        const repoRoot = yield* GitRepoRoot;
        return yield* Effect.tryPromise({
          try: () => fn(simpleGit(repoRoot)),
          catch: (cause) => new GitError({ operation: options.operation, cause }),
        }).pipe(
          Effect.withSpan("Git.git", {
            attributes: { cwd: repoRoot, operation: options.operation },
          }),
        );
      });

    // ── Repo root ────────────────────────────────────────────

    const getRepoRoot = (cwd: string) =>
      Effect.tryPromise({
        try: () => simpleGit(cwd).revparse(["--show-toplevel"]),
        catch: (cause) => new FindRepoRootError({ cause }),
      }).pipe(Effect.map(Str.trim), Effect.withSpan("Git.getRepoRoot", { attributes: { cwd } }));

    const withRepoRoot =
      (cwd: string) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          const repoRoot = yield* getRepoRoot(cwd);
          yield* Effect.logDebug(`Using git repo root: ${repoRoot}`);
          yield* Effect.annotateCurrentSpan({ repoRoot });
          return yield* effect.pipe(Effect.provideService(GitRepoRoot, repoRoot));
        });

    // ── Branch operations ────────────────────────────────────

    const getMainBranch = Effect.fn("Git.getMainBranch")(function* () {
      return yield* raw({
        args: ["symbolic-ref", "refs/remotes/origin/HEAD"],
        operation: "getting main branch (symbolic-ref refs/remotes/origin/HEAD)",
        trim: true,
      }).pipe(
        Effect.map((ref) => ref.replace("refs/remotes/origin/", "")),
        Effect.catchTag("GitError", () =>
          git((git) => git.revparse(["--verify", "origin/main"]), {
            operation: "getting main branch (revparse --verify origin/main)",
          }).pipe(Effect.as("main")),
        ),
        Effect.catchTag("GitError", () =>
          git((git) => git.revparse(["--verify", "origin/master"]), {
            operation: "getting main branch (revparse --verify origin/master)",
          }).pipe(Effect.as("master")),
        ),
        Effect.catchTag("GitError", () =>
          git((git) => git.revparse(["--verify", "main"]), {
            operation: "getting main branch (revparse --verify main)",
          }).pipe(Effect.as("main")),
        ),
        Effect.catchTag("GitError", () =>
          git((git) => git.revparse(["--verify", "master"]), {
            operation: "getting main branch (revparse --verify master)",
          }).pipe(Effect.as("master")),
        ),
        Effect.tapErrorTag("GitError", () =>
          Effect.logWarning(
            `Defaulting to "main" branch as the "main branch" because one could not be determined.`,
          ),
        ),
        Effect.catchTag("GitError", () => Effect.succeed(FALLBACK_PRIMARY_BRANCH)),
        Effect.tap((mainBranch) => Effect.annotateCurrentSpan({ mainBranch })),
      );
    });

    const parseBranchRefLine = (line: string, userEmail: string | undefined) => {
      const [name, fullRef, authorName, rawAuthorEmail, subject, committerDateUnix] =
        line.split("\t");
      const timestampSeconds = Number.parseInt(committerDateUnix ?? "", 10);
      const authorEmail = emptyToUndefined(rawAuthorEmail?.replace(/^<|>$/g, ""));
      return Effect.succeed(
        new Branch({
          name: name ? stripOriginPrefix(name) : "",
          fullRef: fullRef ?? "",
          authorName: emptyToUndefined(authorName) ? Option.some(authorName!) : Option.none(),
          authorEmail: authorEmail !== undefined ? Option.some(authorEmail) : Option.none(),
          subject: emptyToUndefined(subject) ? Option.some(subject!) : Option.none(),
          lastCommitTimestampMs: Number.isNaN(timestampSeconds)
            ? 0
            : timestampSeconds * COMMIT_TIMESTAMP_MS_MULTIPLIER,
          isMyBranch:
            userEmail !== undefined && authorEmail !== undefined && authorEmail === userEmail,
        }),
      );
    };

    const listBranches = Effect.fn("Git.listBranches")(function* (
      limit = DEFAULT_LIST_BRANCHES_LIMIT,
    ) {
      const userEmail = yield* git((g) => g.getConfig("user.email"), {
        operation: "getting user email",
      }).pipe(
        Effect.map((result) => emptyToUndefined(result.value ?? undefined)),
        Effect.catchTag("GitError", () => Effect.succeed(undefined)),
      );

      return yield* raw({
        args: [
          "for-each-ref",
          `--format=${BRANCH_REF_FORMAT}`,
          "--sort=-committerdate",
          "refs/heads",
          "refs/remotes",
        ],
        operation: "getting branches",
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.map(Str.trim)),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.flatMap((lines) =>
          Effect.forEach(lines, (line) => parseBranchRefLine(line, userEmail), {
            concurrency: "unbounded",
          }),
        ),
        Effect.map(Arr.dedupeWith((a, b) => a.name === b.name)),
        Effect.map(Arr.take(limit)),
      );
    });

    const getCurrentBranch = git((git) => git.revparse(["--abbrev-ref", "HEAD"]), {
      operation: "getting current branch",
    }).pipe(
      Effect.tap((currentBranch) => Effect.annotateCurrentSpan({ currentBranch })),
      Effect.withSpan("Git.getCurrentBranch"),
    );

    const isWorkingTreeDirty = raw({
      args: ["status", "--porcelain"],
      operation: "checking if working tree is dirty",
    }).pipe(
      Effect.map(Str.trim),
      Effect.map((output) => output.length > 0),
      Effect.withSpan("Git.isWorkingTreeDirty"),
    );

    const checkout = (branchName: string) =>
      git((git) => git.checkout(branchName), {
        operation: "checking out branch",
      }).pipe(Effect.withSpan("Git.checkout", { attributes: { branchName } }));

    const stage = (relativePath: string) =>
      git((git) => git.add(relativePath), {
        operation: "staging file",
      }).pipe(Effect.withSpan("Git.stage", { attributes: { relativePath } }));

    const unstage = (relativePath: string) =>
      git((git) => git.reset(["HEAD", "--", relativePath]), {
        operation: "unstaging file",
      }).pipe(Effect.withSpan("Git.unstage", { attributes: { relativePath } }));

    const stash = (options: { includeUntracked?: boolean } = {}) =>
      git((git) => git.stash(options.includeUntracked ? ["--include-untracked"] : []), {
        operation: "stashing changes",
      }).pipe(
        Effect.withSpan("Git.stash", {
          attributes: {
            includeUntracked: options.includeUntracked,
          },
        }),
      );

    // ── Diff / Changes ──────────────────────────────────────

    const parseCommittedChangeType = (line: string, repoRoot: string) => {
      const parts = line.split("\t");
      const statusToken = Str.trim(parts[0]!);
      const statusLetter = statusToken[0] as GitStatusLetter;
      const isRenameOrCopy = statusLetter === "R" || statusLetter === "C";
      const relativePath = Str.trim(isRenameOrCopy ? (parts[2] ?? parts[1]!) : parts[1]!);
      const previousPath = isRenameOrCopy ? Str.trim(parts[1]!) : undefined;
      return Effect.succeed(
        new CommittedChange({
          absoluteFilePath: Path.join(repoRoot, relativePath),
          relativePath,
          previousPath,
          status: parseGitStatusLetter(statusLetter),
        }),
      );
    };

    const ABSENT: FileContent = new Absent();
    const BINARY: FileContent = new Binary();

    const computePreviousContent = (currentContent: FileContent, diff: string): FileContent => {
      if (currentContent._tag === "Binary") return currentContent;
      if (diff.length === 0) return currentContent;
      const patches = parsePatch(diff);
      if (patches.length === 0) return currentContent;
      const sourceText = currentContent._tag === "Text" ? currentContent.content : "";
      const result = applyPatch(sourceText, reversePatch(patches)[0]!);
      if (result === false) return ABSENT;
      return result === "" ? ABSENT : new Text({ content: result });
    };

    const readContentFromGit = (ref: string) =>
      raw({
        args: ["show", ref],
        operation: `getting file content (${ref})`,
      }).pipe(
        Effect.map(
          (content): FileContent => (looksLikeBinary(content) ? BINARY : new Text({ content })),
        ),
        Effect.catchTag("GitError", () => Effect.succeed(ABSENT as FileContent)),
      );

    const readContentFromDisk = (relativePath: string) =>
      Effect.gen(function* () {
        const repoRoot = yield* GitRepoRoot;
        return yield* fs.readFileString(Path.join(repoRoot, relativePath)).pipe(
          Effect.map((content) => (looksLikeBinary(content) ? BINARY : new Text({ content }))),
          Effect.catchTag("PlatformError", (e) =>
            e.reason._tag === "NotFound" || String(e.reason.message).includes("EISDIR")
              ? Effect.succeed(ABSENT as FileContent)
              : Effect.fail(e),
          ),
        );
      });

    const getDiffRefArgs = (changesFor: ChangesFor) =>
      Match.typeTags<ChangeType>()({
        Index: () => ["--cached"],
        WorkingTree: () => [],
        Committed: () => {
          if (changesFor._tag === "Commit") {
            return [`${changesFor.hash}^`, changesFor.hash];
          }
          const { base, branchName } = changesFor as Extract<ChangesFor, { _tag: "Branch" }>;
          return [base, branchName];
        },
      });

    const getCurrentContent = (changesFor: ChangesFor) =>
      Match.typeTags<ChangeType>()({
        Index: ({ relativePath }) => readContentFromGit(`:${relativePath}`),
        WorkingTree: ({ relativePath }) => readContentFromDisk(relativePath),
        Committed: ({ relativePath }) => {
          if (changesFor._tag === "Commit") {
            return readContentFromGit(`${changesFor.hash}:${relativePath}`);
          }
          const { branchName } = changesFor as Extract<ChangesFor, { _tag: "Branch" }>;
          return readContentFromGit(`${branchName}:${relativePath}`);
        },
      });

    const changeTypeToDiff = Effect.fnUntraced(function* (
      changesFor: ChangesFor,
      changeType: ChangeType,
      commitHash: Option.Option<CommitHash>,
    ) {
      const diffRefArgs = getDiffRefArgs(changesFor)(changeType);
      const diff = yield* raw({
        args: ["diff", ...ROBUST_DIFF_FLAGS, ...diffRefArgs, "--", changeType.relativePath],
        operation: "getting file diff",
        trim: false,
      });
      const currentContent = yield* getCurrentContent(changesFor)(changeType);

      const previousContent =
        changeType.status === "Untracked" ? ABSENT : computePreviousContent(currentContent, diff);
      const result = new Diff({
        change: changeType,
        diff: new DiffValue({
          before: previousContent,
          after: currentContent,
        }),
        comments: [],
        commitHash,
      });
      return result;
    });

    const getWorkingTreeChangeTypes = Effect.fnUntraced(function* () {
      const repoRoot = yield* GitRepoRoot;
      return yield* raw({
        args: ["status", "--porcelain"],
        operation: "getting working tree status",
        trim: false,
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.map(
          Arr.flatMap((line) => {
            const rawFilePath = line.slice(3);
            const arrowIndex = rawFilePath.indexOf(" -> ");
            const isRename = arrowIndex !== -1;
            const relativeFilePath = isRename ? rawFilePath.slice(arrowIndex + 4) : rawFilePath;
            const previousPath = isRename ? rawFilePath.slice(0, arrowIndex) : undefined;
            const indexStatus = unsafeParseGitStatusLetter(line.at(0)!);
            const workingTreeStatus = unsafeParseGitStatusLetter(line.at(1)!);
            return [
              ...(indexStatus !== undefined && indexStatus !== "Untracked"
                ? [
                    new IndexChange({
                      status: indexStatus,
                      relativePath: relativeFilePath,
                      absoluteFilePath: Path.join(repoRoot, relativeFilePath),
                      previousPath,
                    }),
                  ]
                : []),
              ...(workingTreeStatus !== undefined
                ? [
                    new WorkingTreeChange({
                      status: workingTreeStatus,
                      relativePath: relativeFilePath,
                      absoluteFilePath: Path.join(repoRoot, relativeFilePath),
                      previousPath,
                    }),
                  ]
                : []),
            ] satisfies ChangeType[];
          }),
        ),
      );
    });

    const getChanges = Effect.fnUntraced(function* (changesFor: ChangesFor) {
      const repoRoot = yield* GitRepoRoot;
      if (changesFor._tag === "WorkingTree") {
        const changes = yield* getWorkingTreeChangeTypes();
        return yield* Effect.forEach(
          changes,
          (change) => changeTypeToDiff(changesFor, change, Option.none()),
          { concurrency: "unbounded" },
        );
      }

      if (changesFor._tag === "Commit") {
        const changes = yield* raw({
          args: [
            "diff",
            ...ROBUST_DIFF_FLAGS,
            "--name-status",
            `${changesFor.hash}^`,
            changesFor.hash,
          ],
          operation: "getting changed files list",
        }).pipe(
          Effect.map(Str.split("\n")),
          Effect.map(Arr.map(Str.trim)),
          Effect.map(Arr.filter(Str.isNonEmpty)),
          Effect.flatMap((lines) =>
            Effect.forEach(lines, (line) => parseCommittedChangeType(line, repoRoot), {
              concurrency: "unbounded",
            }),
          ),
        );

        return yield* Effect.forEach(
          changes,
          (change) => changeTypeToDiff(changesFor, change, Option.some(changesFor.hash)),
          { concurrency: "unbounded" },
        );
      }

      const diffOutput = yield* raw({
        args: [
          "diff",
          ...ROBUST_DIFF_FLAGS,
          "--name-status",
          changesFor.base,
          changesFor.branchName,
        ],
        operation: "getting changed files list",
      });

      const commits = yield* listCommits(`${changesFor.base}..${changesFor.branchName}`);
      const commitHash = Arr.head(commits).pipe(Option.map((h) => CommitHash.makeUnsafe(h)));

      const diffLines = diffOutput
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const changes = yield* Effect.forEach(
        diffLines,
        (line) => parseCommittedChangeType(line, repoRoot),
        { concurrency: "unbounded" },
      );

      return yield* Effect.forEach(
        changes,
        (change) => changeTypeToDiff(changesFor, change, commitHash),
        { concurrency: "unbounded" },
      );
    });

    const getMergeBase = Effect.fn("Git.getMergeBase")(function* (branchName: string) {
      const mainBranch = yield* getMainBranch();
      return yield* raw({
        args: ["merge-base", `origin/${mainBranch}`, branchName],
        operation: "getting merge base",
      }).pipe(Effect.map(Str.trim));
    });

    // ── File stats ───────────────────────────────────────────

    const parseFileStatLine = (line: string) => {
      const [added, removed, relativePath] = line.split("\t");
      return Effect.succeed(
        new FileStat({
          relativePath: relativePath ?? "",
          added: Number.parseInt(added ?? "0", 10) || 0,
          removed: Number.parseInt(removed ?? "0", 10) || 0,
        }),
      );
    };

    const getWorkingTreeFileStats = Effect.fn("Git.getWorkingTreeFileStats")(function* () {
      const trackedStats = yield* raw({
        args: ["diff", "HEAD", "--numstat"],
        operation: "getting working tree file stats",
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.map(Str.trim)),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.flatMap((lines) =>
          Effect.forEach(lines, parseFileStatLine, {
            concurrency: "unbounded",
          }),
        ),
      );

      const repoRoot = yield* GitRepoRoot;
      const untrackedStats = yield* raw({
        args: ["ls-files", "--others", "--exclude-standard"],
        operation: "getting untracked files list",
      }).pipe(
        Effect.map(Str.split("\n")),
        Effect.map(Arr.map(Str.trim)),
        Effect.map(Arr.filter(Str.isNonEmpty)),
        Effect.flatMap((paths) =>
          Effect.forEach(
            paths,
            (relativePath) =>
              fs.readFileString(Path.join(repoRoot, relativePath)).pipe(
                Effect.map((content) => content.split("\n").length),
                Effect.map(
                  (lineCount) =>
                    new FileStat({
                      relativePath,
                      added: lineCount,
                      removed: 0,
                    }),
                ),
                Effect.catchTag("PlatformError", (e) =>
                  String(e.reason.message).includes("EISDIR")
                    ? Effect.succeed(undefined)
                    : Effect.fail(e),
                ),
              ),
            { concurrency: "unbounded" },
          ),
        ),
      );

      return [...trackedStats, ...Arr.filter(untrackedStats, Boolean)];
    });

    // ── Conflict detection ───────────────────────────────────

    /** Check whether merging sourceBranch into targetBranch would have conflicts. */
    const hasConflicts = Effect.fn("Git.hasConflicts")(function* (
      targetBranch: string,
      sourceBranch: string,
    ) {
      yield* Effect.annotateCurrentSpan({ targetBranch, sourceBranch });
      const repoRoot = yield* GitRepoRoot;

      const exitCode = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("git", ["merge-tree", "--write-tree", targetBranch, sourceBranch], {
              cwd: repoRoot,
            }),
          );
          return yield* handle.exitCode;
        }),
      );

      const conflicts = exitCode !== 0;
      yield* Effect.logDebug("Conflict check completed", {
        targetBranch,
        sourceBranch,
        conflicts,
      });
      return conflicts;
    });

    // ── Merge ────────────────────────────────────────────────

    const merge = Effect.fn("Git.merge")(function* (
      sourceBranch: string,
      targetBranch: string,
      strategy: MergeStrategy,
    ) {
      yield* Effect.annotateCurrentSpan({
        sourceBranch,
        targetBranch,
        strategy: strategy._tag,
      });
      const repoRoot = yield* GitRepoRoot;

      const mergeBase = yield* raw({
        args: ["merge-base", sourceBranch, targetBranch],
        operation: "getting merge base for merge",
        trim: true,
      });

      const commitHashes = yield* raw({
        args: ["rev-list", "--reverse", `${mergeBase}..${sourceBranch}`],
        operation: "listing commits for merge",
        trim: true,
      }).pipe(Effect.map((s) => s.split("\n").filter(Boolean)));

      if (commitHashes.length === 0) {
        yield* Effect.logInfo("No commits to merge", {
          sourceBranch,
          targetBranch,
        });
        return;
      }

      yield* checkout(targetBranch);

      // SquashMerge: squash all source commits into a single commit on target
      yield* git((g) => g.raw(["merge", "--squash", sourceBranch]), {
        operation: "squash-merging commits",
      });

      // Collect commit messages from source for the squash commit message
      const messages = yield* raw({
        args: ["log", "--format=%s", "--reverse", `${mergeBase}..${sourceBranch}`],
        operation: "collecting commit messages for squash",
        trim: true,
      });

      const squashMessage = messages
        .split("\n")
        .filter(Boolean)
        .map((msg) => `* ${msg}`)
        .join("\n");

      yield* git((g) => g.commit(`Squash merge ${sourceBranch}\n\n${squashMessage}`), {
        operation: "committing squash merge",
      });

      yield* Effect.logInfo("Merge completed", {
        sourceBranch,
        targetBranch,
        strategy: strategy._tag,
        commitCount: commitHashes.length,
      });
    });

    // ── Clone / Branch operations ──────────────────────────────

    const cloneAndCheckout = Effect.fn("Git.cloneAndCheckout")(function* (
      sourceRepoPath: string,
      targetPath: string,
      branchName: string,
      taskId: TaskId,
    ) {
      yield* Effect.annotateCurrentSpan({ taskId, targetPath, branchName });

      if (yield* fs.exists(targetPath)) {
        return yield* new TaskRepoAlreadyExistsError({ taskId });
      }

      // Get the real origin URL from the source repo so the clone
      // points at the actual remote (e.g. GitHub), not a local path.
      const originUrl = yield* git((g) => g.remote(["get-url", "origin"]) as Promise<string>, {
        operation: "getting origin url",
      }).pipe(Effect.provideService(GitRepoRoot, sourceRepoPath), Effect.map(Str.trim));

      yield* git((g) => g.clone(originUrl, targetPath), {
        operation: "cloning repo",
      }).pipe(
        Effect.catchTag("GitError", (e) =>
          new TaskRepoCreateError({ taskId, cause: e }).asEffect(),
        ),
      );

      yield* git((g) => g.checkoutLocalBranch(branchName), {
        operation: "checking out new branch",
      }).pipe(
        Effect.provideService(GitRepoRoot, targetPath),
        Effect.catchTag("GitError", (e) =>
          new TaskRepoCreateError({ taskId, cause: e }).asEffect(),
        ),
      );

      yield* Effect.logInfo("Task repo cloned and branch created", {
        taskId,
        targetPath,
        branch: branchName,
      });
    });

    const deleteBranch = Effect.fn("Git.deleteBranch")(function* (branchName: string) {
      yield* git((g) => g.branch(["-D", branchName]), {
        operation: "deleting branch",
      });
    });

    const push = Effect.fn("Git.push")(function* (branchName: string) {
      yield* git((g) => g.push("origin", branchName), {
        operation: "pushing to origin",
      });

      yield* Effect.logInfo("Pushed to origin", { branchName });
    });

    const pull = Effect.fn("Git.pull")(function* (branchName: string) {
      yield* git((g) => g.pull("origin", branchName), {
        operation: "pulling from origin",
      }).pipe(
        // If the branch doesn't exist on remote yet, pull will fail — that's ok
        Effect.catchTag("GitError", () => Effect.void),
      );

      yield* Effect.logDebug("Pulled from origin", { branchName });
    });

    // ── Commit operations ────────────────────────────────────

    const listCommits = Effect.fn("Git.listCommits")(function* (range?: string) {
      const logOutput = yield* raw({
        args: ["log", "--format=%H", "--no-merges", range ?? "HEAD"],
        operation: "listing commits",
      });

      const hashes = logOutput.trim().split("\n").filter(Boolean);
      yield* Effect.logDebug("Commits listed", {
        commitCount: hashes.length,
      });
      return hashes;
    });

    const commit = Effect.fn("Git.commit")(function* (message: string) {
      yield* git((g) => g.add("-A"), { operation: "staging all files" });
      yield* git((g) => g.commit(message), { operation: "committing" });
      const headHash = yield* raw({
        args: ["rev-parse", "HEAD"],
        operation: "reading HEAD after commit",
        trim: true,
      });
      const commitHash = CommitHash.makeUnsafe(headHash);
      yield* Effect.logInfo("Committed", { message, commitHash });
      return commitHash;
    });

    // ── Changed files (lightweight, no diff content) ─────────

    /**
     * Get the list of changed files between two refs, categorized as
     * added vs modified/deleted. Lightweight — no diff content, just paths and statuses.
     */
    const parseChangedFileLines = (output: string) => {
      const files: Array<string> = [];
      const newFiles: Array<string> = [];
      if (output.length > 0) {
        for (const line of output.split("\n")) {
          const parts = line.split("\t");
          const statusToken = Str.trim(parts[0]!);
          const statusLetter = statusToken[0];
          const isRenameOrCopy = statusLetter === "R" || statusLetter === "C";
          const filePath = Str.trim(isRenameOrCopy ? (parts[2] ?? parts[1]!) : parts[1]!);
          if (statusLetter === "A") {
            newFiles.push(filePath);
          } else {
            files.push(filePath);
          }
        }
      }
      return { files, newFiles };
    };

    const getChangedFiles = Effect.fn("Git.getChangedFiles")(function* (changesFor: ChangesFor) {
      if (changesFor._tag === "WorkingTree") {
        const files: Array<string> = [];
        const newFiles: Array<string> = [];
        const changeTypes = yield* getWorkingTreeChangeTypes();
        for (const ct of changeTypes) {
          if (ct.status === "Added" || ct.status === "Untracked") {
            newFiles.push(ct.relativePath);
          } else {
            files.push(ct.relativePath);
          }
        }
        return { files, newFiles };
      }

      const diffRange =
        changesFor._tag === "Branch"
          ? `${changesFor.base}..${changesFor.branchName}`
          : `${changesFor.hash}^..${changesFor.hash}`;

      const output = yield* raw({
        args: ["diff", "--name-status", diffRange],
        operation: "getting changed file list",
        trim: true,
      });

      return parseChangedFileLines(output);
    });

    /** Restore files from a given source ref into the working tree (unstaged). */
    const restoreFiles = Effect.fn("Git.restoreFiles")(function* (
      source: string,
      paths: ReadonlyArray<string>,
    ) {
      if (paths.length === 0) return;
      yield* Effect.annotateCurrentSpan({ source, fileCount: paths.length });
      yield* raw({
        args: ["restore", `--source=${source}`, "--", ...paths],
        operation: "restoring files from source",
      });
    });

    return {
      withRepoRoot,
      getMainBranch,
      listBranches,
      getCurrentBranch,
      isWorkingTreeDirty,
      checkout,
      stage,
      unstage,
      stash,
      parseCommittedChangeType,
      getChanges,
      getMergeBase,
      getWorkingTreeFileStats,
      hasConflicts,
      merge,
      cloneAndCheckout,
      deleteBranch,
      push,
      pull,
      listCommits,
      commit,
      getChangedFiles,
      restoreFiles,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
