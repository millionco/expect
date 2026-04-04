import { Effect, identity, Layer, Option, ServiceMap, Array as Arr } from "effect";
import { configByBundleId, configByDesktopFile } from "./browser-config";
import { detectDefaultBrowserId } from "./default-browser-id";
import type { Browser } from "./types";
import { ListBrowsersError } from "./errors";

export class Browsers extends ServiceMap.Service<Browsers>()("@cookies/Browsers", {
  make: Effect.gen(function* () {
    const sources = new Set<Effect.Effect<Browser[], ListBrowsersError>>();

    const register = (source: Effect.Effect<Browser[], ListBrowsersError>) =>
      Effect.sync(() => {
        sources.add(source);
      });

    const list = Effect.forEach(sources, identity, {
      concurrency: "unbounded",
    }).pipe(Effect.map(Arr.flatten), Effect.withSpan("Browsers.list"));

    const defaultBrowser = Effect.fn("Browsers.defaultBrowser")(function* () {
      const browserId = yield* detectDefaultBrowserId().pipe(
        Effect.catchTag("ListBrowsersError", (error) =>
          Effect.logWarning("Default browser detection failed", { cause: error.cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );

      if (!browserId) return Option.none<Browser>();

      const normalizedId = browserId.toLowerCase();
      const desktopKey = normalizedId.replace(/\.desktop$/, "");
      const config = configByBundleId(normalizedId) ?? configByDesktopFile(desktopKey);
      if (!config) return Option.none<Browser>();

      const browsers = yield* list;
      return Option.fromNullishOr(
        browsers.find((browser) => {
          if (browser._tag === "ChromiumBrowser") return browser.key === config.key;
          if (browser._tag === "FirefoxBrowser") return config.key === "firefox";
          if (browser._tag === "SafariBrowser") return config.key === "safari";
          return false;
        }),
      );
    });

    return { register, list, defaultBrowser };
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
