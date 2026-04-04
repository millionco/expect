import { useQuery } from "@tanstack/react-query";
import { Effect, Option } from "effect";
import { Browsers, layerLive, browserKeyOf, browserDisplayName } from "@expect/cookies";
import type { BrowserKey } from "@expect/cookies";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { BROWSER_DETECTION_TIMEOUT_MS } from "../constants";

export interface DetectedBrowser {
  key: BrowserKey;
  displayName: string;
  isDefault: boolean;
}

export const useInstalledBrowsers = () =>
  useQuery({
    queryKey: ["installed-browsers"],
    queryFn: (): Promise<DetectedBrowser[]> =>
      Effect.gen(function* () {
        const browsers = yield* Browsers;

        const [allBrowsers, maybeDefault] = yield* Effect.all(
          [
            browsers.list.pipe(Effect.catchTag("ListBrowsersError", () => Effect.succeed([]))),
            browsers.defaultBrowser().pipe(
              Effect.map(Option.map(browserKeyOf)),
              Effect.map(Option.getOrUndefined),
              Effect.catchTag("ListBrowsersError", () => Effect.succeed(undefined)),
            ),
          ],
          { concurrency: "unbounded" },
        );

        const seen = new Set<string>();
        const result: DetectedBrowser[] = [];
        for (const browser of allBrowsers) {
          const key = browserKeyOf(browser);
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({
            key,
            displayName: browserDisplayName(browser),
            isDefault: key === maybeDefault,
          });
        }
        return result;
      }).pipe(
        Effect.timeout(BROWSER_DETECTION_TIMEOUT_MS),
        Effect.provide(layerLive),
        Effect.provide(NodeServices.layer),
        Effect.tapCause((cause) => Effect.logWarning("Browser detection failed", { cause })),
        Effect.catchCause(() => Effect.succeed([] as DetectedBrowser[])),
        Effect.runPromise,
      ),
  });
