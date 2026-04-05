import { describe, it, assert } from "vite-plus/test";
import { Effect, Layer, Option } from "effect";
import { Browsers } from "../src/browser-detector";
import { Cookies } from "../src/cookies";
import { layerLive } from "../src/layers";

const FIVE_MINUTES_MS = 300_000;

const TestLayer = Layer.mergeAll(layerLive, Cookies.layer);

const run = <A, E>(effect: Effect.Effect<A, E, Browsers | Cookies>) =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(TestLayer)));

describe("CdpClient", () => {
  it(
    "default system browser is detected",
    () =>
      run(
        Effect.gen(function* () {
          const browsers = yield* Browsers;
          const defaultBrowser = yield* browsers.defaultBrowser();
          assert.isTrue(Option.isSome(defaultBrowser));
        }),
      ),
    FIVE_MINUTES_MS,
  );

  it(
    "all profiles are listed",
    () =>
      run(
        Effect.gen(function* () {
          const browsers = yield* Browsers;
          const allBrowsers = yield* browsers.list;
          assert.isAbove(allBrowsers.length, 0);
        }),
      ),
    FIVE_MINUTES_MS,
  );

  it(
    "no profile named System Profile",
    () =>
      run(
        Effect.gen(function* () {
          const browsers = yield* Browsers;
          const allBrowsers = yield* browsers.list;
          const systemProfiles = allBrowsers.filter(
            (browser) =>
              browser._tag === "ChromiumBrowser" && browser.profileName === "System Profile",
          );
          assert.strictEqual(systemProfiles.length, 0, "System Profile should be filtered out");
        }),
      ),
    FIVE_MINUTES_MS,
  );

  it(
    "each profile has at least 5 cookies",
    () =>
      run(
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
            if (browser._tag === "SafariBrowser") {
              /* Safari's cookie file requires Full Disk Access (System Settings → Privacy & Security → Full Disk Access) for the terminal/IDE running the test. */
              const result = yield* Effect.suspend(() => cookies.extract(browser)).pipe(
                Effect.catchTag("ExtractionError", () => Effect.succeed(undefined)),
                Effect.catchTag("PlatformError", () => Effect.succeed(undefined)),
              );
              if (result === undefined) continue;
            }

            const result = yield* cookies.extract(browser);

            assert.isAbove(
              result.length,
              4,
              `${label}: expected > 4 cookies, got ${result.length}`,
            );
          }
        }),
      ),
    FIVE_MINUTES_MS,
  );
});
