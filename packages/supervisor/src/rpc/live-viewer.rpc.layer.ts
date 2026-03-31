import { Effect, Layer, Stream } from "effect";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LiveViewer } from "../live-viewer";

export const LiveViewerRpcsLive = LiveViewerRpcs.toLayer(
  Effect.gen(function* () {
    const liveViewer = yield* LiveViewer;

    return LiveViewerRpcs.of({
      "liveViewer.PushRrwebEvents": (request) =>
        liveViewer.push(request.planId, {
          _tag: "RrwebBatch",
          events: request.events,
        }),
      "liveViewer.StreamEvents": (request) => {
        console.error(
          "[RPC] StreamEvents called planId=%s",
          JSON.stringify(request.planId)
        );
        return liveViewer.stream(request.planId);
      },
      "liveViewer.ListTests": () =>
        liveViewer.listTests().pipe(
          Effect.tap((tests) =>
            Effect.sync(() =>
              console.error(
                "[RPC] ListTests returning %d tests: %s",
                tests.length,
                JSON.stringify(tests.map((t) => t.id))
              )
            )
          ),
          Effect.tapCause((cause) =>
            Effect.sync(() =>
              console.error("[RPC] ListTests FAILED:", cause.toString())
            )
          ),
          Effect.orDie
        ),
    });
  })
).pipe(Layer.provide(LiveViewer.layer));
