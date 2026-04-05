import { Effect, Layer, ServiceMap } from "effect";
import type { Artifact } from "@expect/shared/models";
import { ArtifactStorage } from "./artifact-storage";

export class Artifacts extends ServiceMap.Service<Artifacts>()("@browser/Artifacts", {
  make: Effect.gen(function* () {
    const storage = yield* ArtifactStorage;
    const items: Artifact[] = [];

    const push = Effect.fn("Artifacts.push")(function* (artifacts: readonly Artifact[]) {
      for (const artifact of artifacts) {
        items.push(artifact);
      }
      yield* storage.push(artifacts);
    });

    const all = () => items as readonly Artifact[];

    const clear = () => {
      items.length = 0;
    };

    return { push, all, clear } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(ArtifactStorage.layerRpc));

  static layerTest = (onPush: (artifacts: readonly Artifact[]) => void) =>
    Layer.effect(this)(this.make).pipe(
      Layer.provide(
        Layer.succeed(ArtifactStorage, {
          push: (artifacts) => Effect.sync(() => onPush(artifacts)),
        }),
      ),
    );
}
