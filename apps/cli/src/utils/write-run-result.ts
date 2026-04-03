import * as path from "node:path";
import { Effect, Option, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { CiResultOutput } from "@expect/shared/models";

// Persists structured run results to .expect/runs/{planId}.json so outer
// agents (Cursor, Claude Code, Codex) can read a single file instead of
// polling terminal output. Each run gets a unique planId (UUID), enabling
// parallel agent sessions without file conflicts.

const EXPECT_STATE_DIR = ".expect";
const EXPECT_RUNS_DIR = "runs";
const EXPECT_RUNS_MAX_KEPT = 20;

export const writeRunResult = Effect.fn("writeRunResult")(function* (
  planId: string,
  resultOutput: CiResultOutput,
) {
  const fileSystem = yield* FileSystem;
  const runsDir = path.join(process.cwd(), EXPECT_STATE_DIR, EXPECT_RUNS_DIR);

  yield* fileSystem.makeDirectory(runsDir, { recursive: true });

  const filePath = path.join(runsDir, `${planId}.json`);
  const jsonString = JSON.stringify(Schema.encodeSync(CiResultOutput)(resultOutput), undefined, 2);
  yield* fileSystem.writeFileString(filePath, jsonString + "\n");

  yield* pruneOldRuns(runsDir);

  return filePath;
});

const pruneOldRuns = Effect.fn("pruneOldRuns")(function* (runsDir: string) {
  const fileSystem = yield* FileSystem;

  const entries = yield* fileSystem.readDirectory(runsDir);
  const jsonFiles = entries.filter((file) => file.endsWith(".json"));

  if (jsonFiles.length <= EXPECT_RUNS_MAX_KEPT) return;

  const withStats = yield* Effect.forEach(
    jsonFiles,
    (file) =>
      Effect.gen(function* () {
        const filePath = path.join(runsDir, file);
        const stat = yield* fileSystem.stat(filePath);
        const mtime = Option.getOrElse(stat.mtime, () => new Date(0));
        return { filePath, mtime: mtime.getTime() };
      }),
    { concurrency: "unbounded" },
  );

  withStats.sort((left, right) => right.mtime - left.mtime);

  yield* Effect.forEach(
    withStats.slice(EXPECT_RUNS_MAX_KEPT),
    (entry) => fileSystem.remove(entry.filePath),
    { concurrency: "unbounded" },
  );
});
