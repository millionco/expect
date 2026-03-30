import { loadSession } from "@expect/browser";
import { Effect } from "effect";

interface LoadReplayEventsOptions {
  readonly liveViewUrl: string;
  readonly replaySessionPath?: string;
}

const fetchLiveReplayEvents = Effect.fn("fetchLiveReplayEvents")(function* (liveViewUrl: string) {
  return yield* Effect.tryPromise(async () => {
    const response = await fetch(`${liveViewUrl}/latest.json`);
    if (!response.ok) return undefined;
    const data: unknown = await response.json();
    return Array.isArray(data) ? data : undefined;
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("Failed to fetch live replay events", { cause, liveViewUrl }).pipe(
        Effect.as(undefined),
      ),
    ),
  );
});

export const loadReplayEvents = Effect.fn("loadReplayEvents")(function* (
  options: LoadReplayEventsOptions,
) {
  if (options.replaySessionPath) {
    const finalizedEvents = yield* loadSession(options.replaySessionPath).pipe(
      Effect.catchTag("SessionLoadError", (error) =>
        Effect.logWarning("Failed to load finalized replay session", {
          path: options.replaySessionPath,
          message: error.message,
        }).pipe(Effect.as(undefined)),
      ),
    );
    if (finalizedEvents && finalizedEvents.length > 0) {
      return finalizedEvents;
    }
  }

  return yield* fetchLiveReplayEvents(options.liveViewUrl);
});
