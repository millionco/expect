import { NodeFileSystem } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Logger } from "effect";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), ".expect", "logs.md");

export const DebugFileLogger = Logger.formatLogFmt.pipe(Logger.toFile(LOG_FILE));

const EnsureDebugLogDirectoryLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(path.dirname(LOG_FILE), { recursive: true });
    yield* fileSystem.writeFileString(
      path.join(path.dirname(LOG_FILE), ".gitignore"),
      "*\n!.gitignore\n",
    );
  }),
);

export const DebugFileLoggerLayer = Layer.mergeAll(
  EnsureDebugLogDirectoryLayer,
  Logger.layer([DebugFileLogger]),
).pipe(Layer.provide(NodeFileSystem.layer));
