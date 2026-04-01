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
        return liveViewer.stream(request.planId);
      },
      "liveViewer.ListTests": () => liveViewer.listTests().pipe(Effect.orDie),
    });
  }),
).pipe(Layer.provide(LiveViewer.layer));
