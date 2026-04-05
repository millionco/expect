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

  it("findById returns a browser matching the given id", () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const allBrowsers = yield* browsers.list;
      const first = allBrowsers[0];
      const found = yield* browsers.findById(first.id);
      assert.strictEqual(found.id, first.id);
      assert.strictEqual(found.displayName, first.displayName);
    }).pipe(Effect.provide(layerLive), Effect.runPromise));

  it("findById fails with available profile ids when profile does not exist", () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const allBrowsers = yield* browsers.list;
      const error = yield* browsers.findById("nonexistent/profile").pipe(Effect.flip);
      if (error._tag === "ListBrowsersError") throw new Error(`Invalid error returned`);
      assert.strictEqual(error._tag, "BrowserProfileNotFoundError");
      assert.strictEqual(error.profileId, "nonexistent/profile");
      assert.deepStrictEqual(
        error.availableProfileIds,
        allBrowsers.map((browser) => browser.id),
      );
      assert.include(error.message, "nonexistent/profile");
      assert.include(error.message, "Available profiles:");
    }).pipe(Effect.provide(layerLive), Effect.runPromise));
});
