import { Effect, Layer, PubSub, ServiceMap, Stream } from "effect";
import type { Artifact } from "@expect/shared/models";

export class Artifacts extends ServiceMap.Service<Artifacts>()("@browser/Artifacts", {
  make: Effect.gen(function* () {
    const items: Artifact[] = [];
    const pubsub = yield* PubSub.unbounded<Artifact>();

    const push = Effect.fn("Artifacts.push")(function* (...artifacts: Artifact[]) {
      for (const artifact of artifacts) {
        items.push(artifact);
        yield* PubSub.publish(pubsub, artifact);
      }
    });

    const stream = Stream.fromPubSub(pubsub);

    const all = () => items as readonly Artifact[];

    return { push, stream, all } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
