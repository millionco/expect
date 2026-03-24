import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Effect, Predicate } from "effect";
import { FileSystem } from "effect/FileSystem";
import { evaluateRecorderRuntime } from "./utils/evaluate-runtime";
import { SessionLoadError } from "./errors";
import type { CollectResult } from "./types";

export const collectEvents = Effect.fn("Recorder.collectEvents")(function* (page: Page) {
  const events = yield* evaluateRecorderRuntime(page, "getEvents");
  const total = yield* evaluateRecorderRuntime(page, "getEventCount");

  return { events, total: total + events.length } satisfies CollectResult;
});

export const collectAllEvents = Effect.fn("Recorder.collectAllEvents")(function* (page: Page) {
  return yield* evaluateRecorderRuntime(page, "getAllEvents");
});

const isRrwebEvent = (value: unknown): value is eventWithTime =>
  Predicate.isObject(value) && "type" in value && "timestamp" in value;

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
      try: () => {
        const parsed: unknown = JSON.parse(line);
        if (!isRrwebEvent(parsed)) {
          throw new Error("Missing required 'type' and 'timestamp' fields");
        }
        return parsed;
      },
      catch: (cause) =>
        new SessionLoadError({
          path: sessionPath,
          cause: `Invalid rrweb event at line ${index + 1}: ${String(cause)}`,
        }),
    }),
  );

  return events;
});
