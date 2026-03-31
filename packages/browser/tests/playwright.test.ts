import { ConfigProvider, Effect, Layer, Option } from "effect";
import { HttpClient, FetchHttpClient } from "effect/unstable/http";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";
import { describe, it, assert } from "@effect/vitest";
import {
  layerLiveViewerRpcServer,
  layerLiveViewerStaticServer,
} from "../../../apps/cli/src/live-viewer-server";
import { Git, LiveViewer } from "@expect/supervisor";
import { PlanId } from "@expect/shared/models";
import { LIVE_VIEWER_STATIC_PORT } from "@expect/shared";

const planId = PlanId.makeUnsafe(crypto.randomUUID());

const configLayer = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({ EXPECT_PLAN_ID: planId })
);

const layerPlaywright = Layer.mergeAll(
  Playwright.layer,
  layerLiveViewerRpcServer,
  layerLiveViewerStaticServer
).pipe(
  Layer.provide(Artifacts.layer),
  Layer.provide(configLayer),
  Layer.provide(Git.withRepoRoot(process.cwd()))
);

describe("playwright e2e", () => {
  it.live.skip(
    "viewer serves replay page",
    () =>
      Effect.gen(function* () {
        const viewerUrl = `http://localhost:${LIVE_VIEWER_STATIC_PORT}/replay/?testId=${planId}`;
        const response = yield* HttpClient.get(viewerUrl);
        assert.notStrictEqual(response.status, 404);
        const html = yield* response.text;
        assert.include(html, "<!DOCTYPE html>");
      }).pipe(
        Effect.provide(layerPlaywright),
        Effect.provide(FetchHttpClient.layer)
      ),
    { timeout: 60_000 }
  );

  it.live(
    "should run an Effect and assert the result",
    () =>
      Effect.gen(function* () {
        const playwright = yield* Playwright;
        console.log(
          `Live viewer: http://localhost:${LIVE_VIEWER_STATIC_PORT}/replay/?testId=${planId}`
        );
        yield* playwright.open({
          headless: false,
          browserProfile: Option.none(),
          initialNavigation: Option.some({ url: "https://www.skosh.dev/" }),
          cdpUrl: Option.none(),
        });

        const snapshot = yield* playwright.snapshot({});
        console.log("Snapshot");
        console.log(snapshot);
        yield* Effect.never;
      }).pipe(Effect.provide(layerPlaywright)),
    { timeout: 60_000 }
  );
});
