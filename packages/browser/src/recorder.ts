import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { evaluateRuntime } from "./utils/evaluate-runtime";
import { RecorderInjectionError, SessionLoadError } from "./errors";
import type { CollectResult } from "./types";

export const collectEvents = Effect.fn("Recorder.collectEvents")(function* (page: Page) {
  const events = yield* evaluateRuntime(page, "getEvents").pipe(
    Effect.catchTag("UnknownError", (error) =>
      new RecorderInjectionError({ cause: String(error) }).asEffect(),
    ),
  );
  const total = yield* evaluateRuntime(page, "getEventCount").pipe(
    Effect.catchTag("UnknownError", (error) =>
      new RecorderInjectionError({ cause: String(error) }).asEffect(),
    ),
  );

  return { events, total: total + events.length } satisfies CollectResult;
});

export const collectAllEvents = Effect.fn("Recorder.collectAllEvents")(function* (page: Page) {
  return yield* evaluateRuntime(page, "getAllEvents").pipe(
    Effect.catchTag("UnknownError", (error) =>
      new RecorderInjectionError({ cause: String(error) }).asEffect(),
    ),
  );
});

export const saveSession = Effect.fn("Recorder.saveSession")(function* (
  events: ReadonlyArray<eventWithTime>,
  outputPath: string,
) {
  const fileSystem = yield* FileSystem;
  const lines = events.map((event) => JSON.stringify(event));
  const content = lines.join("\n") + "\n";
  yield* fileSystem.writeFileString(outputPath, content);
});

export const loadSession = Effect.fn("Recorder.loadSession")(function* (sessionPath: string) {
  const fileSystem = yield* FileSystem;
  const content = yield* fileSystem
    .readFileString(sessionPath)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        new SessionLoadError({ path: sessionPath, cause: String(error) }).asEffect(),
      ),
    );

  const lines = content.trim().split("\n");
  const events = yield* Effect.forEach(lines, (line, index) =>
    Effect.try({
      try: () => JSON.parse(line) as eventWithTime,
      catch: (cause) =>
        new SessionLoadError({
          path: sessionPath,
          cause: `Invalid JSON at line ${index + 1}: ${String(cause)}`,
        }),
    }),
  );

  return events;
});
