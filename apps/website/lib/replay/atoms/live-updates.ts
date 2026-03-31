import { Effect, Stream } from "effect";
import { ViewerClient, ViewerRuntime } from "../rpc-client";
import { __EXPECT_INJECTED_EVENTS__ } from "../injected-events";
import { selectedTestIdAtom } from "./selected-test";

export const liveUpdatesAtom = ViewerRuntime.pull((ctx) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* ViewerClient;
      if (__EXPECT_INJECTED_EVENTS__) {
        return Stream.fromIterable(__EXPECT_INJECTED_EVENTS__);
      }
      const planId = yield* ctx.some(selectedTestIdAtom);
      return client("liveViewer.StreamEvents", { planId });
    }),
  ),
);
