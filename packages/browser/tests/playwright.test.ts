import { Effect, Layer, Option } from "effect";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";
import { NodeRuntime } from "@effect/platform-node";
import { describe, it, assert } from "@effect/vitest";
import {
  layerLiveViewerRpcServer,
  layerLiveViewerStaticServer,
} from "../../../apps/cli/src/live-viewer-server";

const layerPlaywright = Layer.mergeAll(
  Playwright.layer,
  layerLiveViewerRpcServer,
  layerLiveViewerStaticServer,
).pipe(Layer.provide(Artifacts.layer));

describe("playwright e2e", () => {
  // Use `it.effect` to run Effect tests (provides Scope automatically)
  it.live(
    "should run an Effect and assert the result",
    () =>
      Effect.gen(function* () {
        const playwright = yield* Playwright;
        console.log(`Starting live viewer static server on http://localhost:38931`);
        yield* playwright.open({
          headless: false,
          browserProfile: Option.none(),
          initialNavigation: Option.some({ url: "https://www.skosh.dev/" }),
        });

        const snapshot = yield* playwright.snapshot();
        console.log("Snapshot");
        console.log(snapshot);
        yield* Effect.never;
      }).pipe(Effect.provide(layerPlaywright)),
    { timeout: 60_000 },
  );
});
