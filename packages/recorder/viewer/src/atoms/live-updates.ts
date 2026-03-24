import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ViewerClient, ViewerRuntime } from "../rpc/client";
import { __EXPECT_INJECTED_EVENTS__ } from "../injected-events";

export const liveUpdatesAtom = ViewerRuntime.pull(() =>
  Stream.unwrap(
    Effect.gen(function* () {
      if (__EXPECT_INJECTED_EVENTS__) {
        return Stream.fromIterable(__EXPECT_INJECTED_EVENTS__);
      }
      const client = yield* ViewerClient;
      return client("liveViewer.StreamEvents", {});
    }),
  ),
).pipe(Atom.keepAlive);
