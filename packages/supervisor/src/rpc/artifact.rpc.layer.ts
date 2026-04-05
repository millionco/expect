import { Effect, Layer, Stream } from "effect";
import { ArtifactRpcs } from "@expect/shared/rpcs";
import { ArtifactStore } from "../artifact-store";

export const ArtifactRpcsLive = ArtifactRpcs.toLayer(
  Effect.gen(function* () {
    const artifactStore = yield* ArtifactStore;

    return ArtifactRpcs.of({
      "artifact.PushArtifacts": (request) =>
        Effect.forEach(request.batch, (artifact) =>
          artifactStore.push(request.planId, artifact),
        ).pipe(
          Effect.tap(() =>
            Effect.logDebug(
              `Artifacts pushed. plan ID: ${request.planId},  (${request.batch
                .map((a) => a._tag)
                .join(", ")})`,
            ),
          ),
          Effect.asVoid,
        ),
      "artifact.StreamEvents": (request) => {
        return artifactStore.stream(request.planId);
      },
      "artifact.GetAllArtifacts": (request) => artifactStore.readAll(request.planId),
      "artifact.ListTests": () =>
        artifactStore
          .listTests()
          .pipe(Effect.tap((tests) => Effect.logDebug(`Listed ${tests.length} tests`))),
    });
  }),
).pipe(Layer.provide(ArtifactStore.layer));
