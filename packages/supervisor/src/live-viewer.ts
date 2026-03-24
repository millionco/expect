import { Effect, Layer, PubSub, Stream, ServiceMap } from "effect";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";
import { Updates } from "./updates";

export class LiveViewer extends ServiceMap.Service<LiveViewer>()("@supervisor/LiveViewer", {
  make: Effect.gen(function* () {
    const updates = yield* Updates;
    const pubsub = yield* PubSub.unbounded<LiveUpdatePayload>();

    const push = Effect.fn("LiveViewer.push")(function* (payload: LiveUpdatePayload) {
      yield* PubSub.publish(pubsub, payload);
    });

    const stream = Stream.fromPubSub(pubsub);

    const updatesStream = yield* updates.stream();
    yield* updatesStream.pipe(
      Stream.tap((update) => PubSub.publish(pubsub, { _tag: "Execution", event: update.content })),
      Stream.runDrain,
      Effect.forkDetach,
    );

    return { push, stream } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Updates.layer));
}
