import { Cause, ConfigProvider, Console, Duration, Effect, Layer, Option, Stream } from "effect";
import { HttpClient, FetchHttpClient } from "effect/unstable/http";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";
import { describe, it, assert } from "vite-plus/test";
import {
  layerArtifactRpcServer,
  layerArtifactViewerProxy,
} from "../../../apps/cli/src/artifact-server";
import { Git, ArtifactStore } from "@expect/supervisor";
import { Artifact, CurrentPlanId, PlanId, RrwebEvent } from "@expect/shared/models";
import { LIVE_VIEWER_STATIC_PORT } from "@expect/shared";
import { ArtifactClient } from "../src/mcp/artifact-client";

const planId = PlanId.makeUnsafe(crypto.randomUUID());

const configLayer = ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ EXPECT_PLAN_ID: planId }));

const layerServer = Layer.mergeAll(layerArtifactRpcServer, layerArtifactViewerProxy).pipe(
  Layer.provide(configLayer),
  Layer.provide(Git.withRepoRoot(process.cwd())),
  Layer.provide(Layer.succeed(CurrentPlanId, planId)),
);

const layerPlaywright = Layer.mergeAll(
  Playwright.layer,
  ArtifactClient.layer,
  FetchHttpClient.layer,
).pipe(Layer.provide(Artifacts.layer), Layer.provide(configLayer), Layer.provideMerge(layerServer));

const run = <A>(
  effect: Effect.Effect<A, unknown, ArtifactClient | Playwright | HttpClient.HttpClient>,
) =>
  effect.pipe(
    Effect.provide(layerPlaywright),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.die(cause),
    ),
    Effect.tapCause((cause) => {
      return Console.log(Cause.pretty(cause));
    }),
    Effect.runPromise,
  );

describe("playwright e2e", () => {
  it(
    "viewer serves replay page",
    () =>
      Effect.gen(function* () {
        const viewerUrl = `http://localhost:${LIVE_VIEWER_STATIC_PORT}/replay/?testId=${planId}`;
        const response = yield* HttpClient.get(viewerUrl);
        assert.notStrictEqual(response.status, 404);
        const html = yield* response.text;
        assert.include(html.toLowerCase(), "<!doctype html>");
      }).pipe(run),
    60_000,
  );

  it(
    "navigates to a website, and records a replay",
    () =>
      Effect.gen(function* () {
        const playwright = yield* Playwright;
        const artifactsClient = yield* ArtifactClient;

        console.log(
          `Live viewer: http://localhost:${LIVE_VIEWER_STATIC_PORT}/replay/?testId=${planId}`,
        );
        yield* playwright.open({
          headless: true,
          browserProfile: Option.none(),
          initialNavigation: Option.some({ url: "https://www.skosh.dev/" }),
          cdpUrl: Option.none(),
        });

        const snapshot = yield* playwright.snapshot({});
        assert.include(snapshot.tree, "Always learning.");
        assert.include(snapshot.tree, "heading");
        assert.isAbove(snapshot.stats.totalRefs, 5);

        yield* Effect.sleep("15 seconds");

        const events = yield* artifactsClient["artifact.StreamEvents"]({
          planId,
        }).pipe(
          Stream.filter((a): a is RrwebEvent => a._tag === "RrwebEvent"),
          Stream.take(5),
          Stream.runCollect,
        );
        console.log("EVENTS:");
        console.log(events);
        assert.isAbove(events.length, 2, "expected rrweb recording events");
        assert.isDefined(events[0].event, "rrweb event should have event data");
      }).pipe(run),
    60_000,
  );
});
