import { Effect, PubSub, Ref } from "effect";
import type { eventWithTime } from "@rrweb/types";
import type { ViewerRunState } from "./viewer-events";

export interface ReplayBroadcast {
  readonly publishEvents: (events: readonly eventWithTime[]) => Effect.Effect<void>;
  readonly publishRunState: (state: ViewerRunState) => Effect.Effect<void>;
  readonly snapshotEvents: Effect.Effect<readonly eventWithTime[]>;
  readonly snapshotRunState: Effect.Effect<ViewerRunState | undefined>;
  readonly eventsPubSub: PubSub.PubSub<readonly eventWithTime[]>;
  readonly runStatePubSub: PubSub.PubSub<ViewerRunState>;
}

export const makeReplayBroadcast = Effect.gen(function* () {
  const eventsRef = yield* Ref.make<eventWithTime[]>([]);
  const runStateRef = yield* Ref.make<ViewerRunState | undefined>(undefined);
  const eventsPubSub = yield* PubSub.unbounded<readonly eventWithTime[]>();
  const runStatePubSub = yield* PubSub.unbounded<ViewerRunState>();

  const publishEvents = (events: readonly eventWithTime[]) =>
    Effect.gen(function* () {
      yield* Ref.update(eventsRef, (previous) => {
        for (const event of events) previous.push(event);
        return previous;
      });
      yield* PubSub.publish(eventsPubSub, events);
    });

  const publishRunState = (state: ViewerRunState) =>
    Effect.gen(function* () {
      yield* Ref.set(runStateRef, state);
      yield* PubSub.publish(runStatePubSub, state);
    });

  return {
    publishEvents,
    publishRunState,
    snapshotEvents: Ref.get(eventsRef),
    snapshotRunState: Ref.get(runStateRef),
    eventsPubSub,
    runStatePubSub,
  } satisfies ReplayBroadcast;
});
