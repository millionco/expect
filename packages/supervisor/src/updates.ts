import { DateTime, Effect, Layer, PubSub, ServiceMap, Stream } from "effect";
import type { ExecutionEvent } from "@expect/shared/models";
import { Update } from "@expect/shared/models";

export class Updates extends ServiceMap.Service<Updates>()(
  "@supervisor/Updates",
  {
    make: Effect.gen(function* () {
      const pubsub = yield* PubSub.unbounded<Update>();

      const publish = Effect.fn("Updates.publish")(function* (
        content: ExecutionEvent
      ) {
        yield* PubSub.publish(
          pubsub,
          new Update({ content, receivedAt: DateTime.nowUnsafe() })
        );
      });

      const stream = Effect.fn("Updates.stream")(function* () {
        return Stream.fromPubSub(pubsub);
      });

      return { publish, stream } as const;
    }),
  }
) {
  static layer = Layer.effect(this)(this.make);
}
