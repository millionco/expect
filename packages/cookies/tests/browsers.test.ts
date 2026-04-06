import { assert, describe, it } from "vite-plus/test";
import { Effect, Option } from "effect";
import { Browsers } from "../src/browser-detector";
import { layerLive } from "../src/layers";

describe("Browsers", () => {
  it("returns at least 2 browsers", () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const results = yield* browsers.list;
      assert.isArray(results);
      assert.isAbove(results.length, 1);
    }).pipe(Effect.provide(layerLive), Effect.runPromise));

  it("chromium browsers have an executablePath", () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const results = yield* browsers.list;
      const chromium = results.filter((browser) => browser._tag === "ChromiumBrowser");
      assert.isAbove(chromium.length, 0);
      for (const browser of chromium) {
        assert.isString(browser.executablePath);
        assert.notStrictEqual(browser.executablePath, "");
      }
    }).pipe(Effect.provide(layerLive), Effect.runPromise));

  it("does not include Chromium System Profile", () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const results = yield* browsers.list;
      const chromium = results.filter((browser) => browser._tag === "ChromiumBrowser");

      assert.isTrue(chromium.every((browser) => browser.profileName !== "System Profile"));
    }).pipe(Effect.provide(layerLive), Effect.runPromise));

  it("defaultBrowser returns a known browser or none", () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const result = yield* browsers.defaultBrowser();
      if (Option.isSome(result)) {
        const tag = result.value._tag;
        assert.isTrue(
          tag === "ChromiumBrowser" || tag === "FirefoxBrowser" || tag === "SafariBrowser",
        );
      }
    }).pipe(Effect.provide(layerLive), Effect.runPromise));
});
