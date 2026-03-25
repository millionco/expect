import { Effect, Layer } from "effect";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LiveViewer } from "../live-viewer";

export const LiveViewerRpcsLive = LiveViewerRpcs.toLayer(
  Effect.gen(function* () {
    const liveViewer = yield* LiveViewer;

    return LiveViewerRpcs.of({
      "liveViewer.PushRrwebEvents": (request) =>
        Effect.tap(
          liveViewer.push({ _tag: "RrwebBatch", events: request.events }),
          () => Effect.logFatal(`PushRrwebEvents received ${request.events.length} events`),
        ),
      "liveViewer.StreamEvents": () => liveViewer.stream,
    });
  })
).pipe(Layer.provide(LiveViewer.layer));
