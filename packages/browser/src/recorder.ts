import type { Page } from "playwright";
import { Effect } from "effect";
import { evaluateRuntime } from "./utils/evaluate-runtime";
import { RecorderInjectionError } from "./errors";
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
