import { assert, describe, it } from "vitest";
import { Effect, Layer } from "effect";
import { Browsers } from "../src/browser-detector.js";
import { Cookies } from "../src/cookies.js";
import { layerLive } from "../src/layers.js";

const CookiesTestLayer = Layer.mergeAll(layerLive, Cookies.layer);

const findCookie = (
  cookies: readonly { name: string; domain: string; expires?: number }[],
  name: string,
  domain: string,
) => cookies.find((cookie) => cookie.name === name && cookie.domain === domain);

describe("Cookies", () => {
  it("extracts at least 5 cookies for each detected browser", { timeout: 60_000 }, () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const cookies = yield* Cookies;
      const allBrowsers = yield* browsers.list;

      assert.isAbove(allBrowsers.length, 0);

      for (const browser of allBrowsers) {
        const result = yield* cookies.extract(browser);
        assert.isArray(result);
        assert.isAbove(
          result.length,
          5,
          `expected at least 5 cookies for ${browser._tag} but got ${result.length}`,
        );
      }
    }).pipe(Effect.scoped, Effect.provide(CookiesTestLayer), Effect.runPromise),
  );

  it("regression: works for Dia", { timeout: 30_000 }, () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const cookies = yield* Cookies;
      const allBrowsers = yield* browsers.list;

      const dia = allBrowsers.find(
        (browser) => browser._tag === "ChromiumBrowser" && browser.key === "dia",
      );
      assert.isDefined(dia);

      const result = yield* cookies.extract(dia!);
      console.log(result);
    }).pipe(Effect.scoped, Effect.provide(CookiesTestLayer), Effect.runPromise),
  );

  it("Firefox: __Secure-YEC on youtube.com has correct expiry", { timeout: 60_000 }, () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const cookies = yield* Cookies;
      const allBrowsers = yield* browsers.list;

      const firefox = allBrowsers.find((browser) => browser._tag === "FirefoxBrowser");
      assert.isDefined(firefox);

      const result = yield* cookies.extract(firefox!);
      const cookie = findCookie(result, "__Secure-YEC", "youtube.com");
      assert.isDefined(cookie, "cookie __Secure-YEC not found on youtube.com");
      assert.strictEqual(cookie!.expires, 1807799243);
    }).pipe(Effect.scoped, Effect.provide(CookiesTestLayer), Effect.runPromise),
  );

  it("Safari: APISID on youtube.com has correct expiry", { timeout: 60_000 }, () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const cookies = yield* Cookies;
      const allBrowsers = yield* browsers.list;

      const safari = allBrowsers.find((browser) => browser._tag === "SafariBrowser");
      assert.isDefined(safari);

      const result = yield* cookies.extract(safari!);
      const cookie = findCookie(result, "APISID", "youtube.com");
      assert.isDefined(cookie, "cookie APISID not found on youtube.com");
      assert.strictEqual(cookie!.expires, 1807102306);
    }).pipe(Effect.scoped, Effect.provide(CookiesTestLayer), Effect.runPromise),
  );

  it("Chrome: APISID on google.com has correct expiry", { timeout: 60_000 }, () =>
    Effect.gen(function* () {
      const browsers = yield* Browsers;
      const cookies = yield* Cookies;
      const allBrowsers = yield* browsers.list;

      const chrome = allBrowsers.find(
        (browser) => browser._tag === "ChromiumBrowser" && browser.key === "chrome",
      );
      assert.isDefined(chrome);

      const result = yield* cookies.extract(chrome!);
      const cookie = findCookie(result, "APISID", "google.com");
      assert.isDefined(cookie, "cookie APISID not found on google.com");
      assert.strictEqual(cookie!.expires, 1807347526);
    }).pipe(Effect.scoped, Effect.provide(CookiesTestLayer), Effect.runPromise),
  );
});
