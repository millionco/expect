import type { eventWithTime } from "@rrweb/types";
import { Effect } from "effect";
import { ViewerPushError } from "./errors";
import type { ViewerRunState } from "./viewer-events";

export interface ViewerClient {
  readonly runId: string;
  readonly viewerUrl: string;
  readonly pushReplayEvents: (events: readonly eventWithTime[]) => Effect.Effect<void>;
  readonly pushRunState: (state: ViewerRunState) => Effect.Effect<void>;
}

export const createViewerClient = (baseUrl: string, runId: string): ViewerClient => {
  const eventsUrl = `${baseUrl}/api/runs/${runId}/events`;
  const stepsUrl = `${baseUrl}/api/runs/${runId}/steps`;
  const viewerUrl = `${baseUrl}/runs/${runId}`;

  const post = Effect.fn("ViewerClient.post")(function* (url: string, body: unknown) {
    yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      catch: (cause) => new ViewerPushError({ url, cause: String(cause) }),
    }).pipe(Effect.catchTag("ViewerPushError", (error) => Effect.logDebug(error.message)));
  });

  return {
    runId,
    viewerUrl,
    pushReplayEvents: (events) => post(eventsUrl, events),
    pushRunState: (state) => post(stepsUrl, state),
  };
};
