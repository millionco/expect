import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { Effect, FileSystem, Layer, Logger } from "effect";
import * as path from "node:path";

const LOG_FILE = path.join(process.cwd(), ".expect", "logs.md");

export const DebugFileLogger = Logger.formatLogFmt.pipe(Logger.toFile(LOG_FILE));

const EnsureDebugLogDirectoryLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(path.dirname(LOG_FILE), { recursive: true });
    // Add a .gitignore inside the directory to prevent the directory from being committed to git.
    yield* fileSystem.writeFileString(path.join(path.dirname(LOG_FILE), ".gitignore"), "*\n");
  }),
);

export const DebugFileLoggerLayer = Logger.layer([Logger.consolePretty(), DebugFileLogger]).pipe(
  Layer.provide(EnsureDebugLogDirectoryLayer),
  Layer.provide(NodeFileSystem.layer),
);
