import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ViewerClient, ViewerRuntime } from "../rpc/client";
import { __EXPECT_INJECTED_EVENTS__ } from "../injected-events";

export const liveUpdatesAtom = ViewerRuntime.pull(() =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* ViewerClient;
      if (__EXPECT_INJECTED_EVENTS__) {
        return Stream.fromIterable(__EXPECT_INJECTED_EVENTS__);
      }
      console.log("LiveUpdatesAtom");
      return client("liveViewer.StreamEvents", undefined).pipe(
        Stream.tap((recv) => Effect.logFatal(`recv`, recv._tag))
      );
    })
  )
).pipe(Atom.keepAlive);
