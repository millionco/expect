import { Effect, identity, Layer, Option, Schema, ServiceMap, Array as Arr } from "effect";
import getDefaultBrowser from "default-browser";
import { configByBundleId, configByDesktopFile } from "./browser-config";
import { ListBrowsersError } from "./errors";
import type { Browser } from "@expect/shared/models";

export class BrowserProfileNotFoundError extends Schema.ErrorClass<BrowserProfileNotFoundError>(
  "BrowserProfileNotFoundError",
)({
  _tag: Schema.tag("BrowserProfileNotFoundError"),
  profileId: Schema.String,
  availableProfileIds: Schema.Array(Schema.String),
}) {
  message = `Browser profile not found: ${
    this.profileId
  }. Available profiles: ${this.availableProfileIds.join(", ")}`;
}

export class Browsers extends ServiceMap.Service<Browsers>()("@cookies/Browsers", {
  make: Effect.gen(function* () {
    const sources = new Set<Effect.Effect<Browser[], ListBrowsersError>>();

    const register = (source: Effect.Effect<Browser[], ListBrowsersError>) =>
      Effect.sync(() => {
        sources.add(source);
      });

    const list = Effect.forEach(sources, identity, {
      concurrency: "unbounded",
    }).pipe(
      Effect.map(Arr.flatten),
      /** @note(rasmus): we filter out System Profile, because usually this one doesn't contain any cookies and arent actually used by users. */
      Effect.map(
        Arr.filter((browser) =>
          browser._tag === "ChromiumBrowser" && browser.profileName === "System Profile"
            ? false
            : true,
        ),
      ),
      Effect.withSpan("Browsers.list"),
    );

    const findById = Effect.fn("Browsers.findById")(function* (profileId: string) {
      const browsers = yield* list;
      const match = Arr.findFirst(browsers, (browser) => browser.id === profileId);
      if (Option.isNone(match)) {
        return yield* new BrowserProfileNotFoundError({
          profileId,
          availableProfileIds: browsers.map((b) => b.id),
        });
      }
      return match.value;
    });

    const defaultBrowser = Effect.fn("Browsers.defaultBrowser")(function* () {
      const result = yield* Effect.tryPromise({
        try: () => getDefaultBrowser(),
        catch: (cause) => new ListBrowsersError({ cause: String(cause) }),
      }).pipe(
        Effect.catchTag("ListBrowsersError", (error) =>
          Effect.logWarning("Default browser detection failed", {
            cause: error.cause,
          }).pipe(Effect.as(undefined)),
        ),
      );

      if (!result) return Option.none<Browser>();

      const normalizedId = result.id.toLowerCase();
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

    return { register, list, findById, defaultBrowser };
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
