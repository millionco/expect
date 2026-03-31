import { describe, it, assert } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { Browsers } from "../src/browser-detector";
import { Cookies } from "../src/cookies";
import { layerLive } from "../src/layers";

const FIVE_MINUTES_MS = 300_000;

const TestLayer = Layer.mergeAll(layerLive, Cookies.layer);

describe("CdpClient", () => {
  it.effect(
    "default system browser is detected",
    () =>
      Effect.gen(function* () {
        const browsers = yield* Browsers;
        const defaultBrowser = yield* browsers.defaultBrowser();
        assert.isTrue(Option.isSome(defaultBrowser));
      }).pipe(Effect.scoped, Effect.provide(TestLayer)),
    { timeout: FIVE_MINUTES_MS }
  );

  it.effect(
    "all profiles are listed",
    () =>
      Effect.gen(function* () {
        const browsers = yield* Browsers;
        const allBrowsers = yield* browsers.list;
        assert.isAbove(allBrowsers.length, 0);
      }).pipe(Effect.scoped, Effect.provide(TestLayer)),
    { timeout: FIVE_MINUTES_MS }
  );

  it.effect(
    "no profile named System Profile",
    () =>
      Effect.gen(function* () {
        const browsers = yield* Browsers;
        const allBrowsers = yield* browsers.list;
        const systemProfiles = allBrowsers.filter(
          (browser) =>
            browser._tag === "ChromiumBrowser" &&
            browser.profileName === "System Profile",
        );
        assert.strictEqual(systemProfiles.length, 0, "System Profile should be filtered out");
      }).pipe(Effect.scoped, Effect.provide(TestLayer)),
    { timeout: FIVE_MINUTES_MS }
  );

  it.live(
    "each profile has at least 5 cookies",
    () =>
      Effect.gen(function* () {
        const browsers = yield* Browsers;
        const cookies = yield* Cookies;
        const allBrowsers = yield* browsers.list;

        for (const browser of allBrowsers) {
          const label =
            browser._tag === "ChromiumBrowser"
              ? `${browser.key}/${browser.profileName}`
              : browser._tag === "FirefoxBrowser"
              ? `firefox/${browser.profileName}`
              : "safari";
          const result = yield* cookies.extract(browser);
          assert.isAbove(
            result.length,
            4,
            `${label}: expected > 4 cookies, got ${result.length}`
          );
        }
      }).pipe(Effect.scoped, Effect.provide(TestLayer)),
    { timeout: FIVE_MINUTES_MS }
  );
});
