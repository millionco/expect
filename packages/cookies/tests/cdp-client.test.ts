import { assert, describe, it } from "vite-plus/test";
import { Effect } from "effect";
import { CdpClient } from "../src/cdp-client.js";

const CHROME_PROFILE_PATH = "/Users/rasmus/Library/Application Support/Google/Chrome/Default";
const CHROME_EXECUTABLE_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const CdpTestLayer = CdpClient.layer;

describe("CdpClient", () => {
  it("extracts cookies from a Chrome profile via CDP", { timeout: 30_000 }, () =>
    Effect.gen(function* () {
      const cdpClient = yield* CdpClient;
      const cookies = yield* cdpClient.extractCookies({
        key: "chrome",
        profilePath: CHROME_PROFILE_PATH,
        executablePath: CHROME_EXECUTABLE_PATH,
      });

      assert.isArray(cookies);
      assert.isAbove(cookies.length, 0);

      const first = cookies[0];
      assert.isString(first.name);
      assert.isString(first.value);
      assert.isString(first.domain);
      assert.isString(first.path);
      assert.isBoolean(first.secure);
      assert.isBoolean(first.httpOnly);
    }).pipe(Effect.scoped, Effect.provide(CdpTestLayer), Effect.runPromise),
  );

  it("returns cookies with stripped leading dots on domains", { timeout: 30_000 }, () =>
    Effect.gen(function* () {
      const cdpClient = yield* CdpClient;
      const cookies = yield* cdpClient.extractCookies({
        key: "chrome",
        profilePath: CHROME_PROFILE_PATH,
        executablePath: CHROME_EXECUTABLE_PATH,
      });

      for (const cookie of cookies) {
        assert.isFalse(
          cookie.domain.startsWith("."),
          `domain should not start with dot: ${cookie.domain}`,
        );
      }
    }).pipe(Effect.scoped, Effect.provide(CdpTestLayer), Effect.runPromise),
  );
});
