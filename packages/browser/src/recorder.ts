import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { evaluateRuntime } from "./utils/evaluate-runtime";
import { RecorderInjectionError, SessionLoadError } from "./errors";
import type { CollectResult } from "./types";

export const collectEvents = Effect.fn("Recorder.collectEvents")(function* (page: Page) {
  const events = yield* evaluateRuntime(page, "getEvents").pipe(
    Effect.catchCause((cause) => new RecorderInjectionError({ cause: String(cause) }).asEffect()),
  );
  const total = yield* evaluateRuntime(page, "getEventCount").pipe(
    Effect.catchCause((cause) => new RecorderInjectionError({ cause: String(cause) }).asEffect()),
  );

  return { events, total: total + events.length } satisfies CollectResult;
});

export const collectAllEvents = Effect.fn("Recorder.collectAllEvents")(function* (page: Page) {
  return yield* evaluateRuntime(page, "getAllEvents").pipe(
    Effect.catchCause((cause) => new RecorderInjectionError({ cause: String(cause) }).asEffect()),
  );
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
