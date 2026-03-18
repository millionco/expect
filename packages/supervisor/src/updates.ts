import { Effect, Layer, PubSub, ServiceMap, Stream } from "effect";
import type { UpdateContent } from "./models.js";

export class Updates extends ServiceMap.Service<Updates>()("@supervisor/Updates", {
  make: Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<UpdateContent>();

    const publish = Effect.fn("Updates.publish")(function* (content: UpdateContent) {
      yield* PubSub.publish(pubsub, content);
    });

    const stream = Effect.fn("Updates.stream")(function* () {
      return Stream.fromPubSub(pubsub);
    });

    return { publish, stream } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
