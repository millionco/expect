import * as path from "node:path";
import { Effect, Layer, Match, Option, Schema, SchemaGetter, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CdpClient } from "./cdp-client";
import { SqliteClient } from "./sqlite-client";
import { ChromiumSqliteFallback } from "./chromium-sqlite";
import { ExtractionError, RequiresFullDiskAccess, UnknownError } from "./errors";
import { parseBinaryCookies } from "./utils/binary-cookies";
import { SameSitePolicy, Cookie, type Browser } from "./types";

const SAME_SITE_NONE = 0;
const SAME_SITE_LAX = 1;
const SAME_SITE_STRICT = 2;
const MS_PER_SECOND = 1000;

const SqliteBool = Schema.Union([Schema.Number, Schema.BigInt]).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => Number(value) !== 0),
    encode: SchemaGetter.transform((value) => (value ? 1 : 0)),
  }),
);

const FirefoxExpiry = Schema.Union([Schema.Number, Schema.BigInt, Schema.String]).pipe(
  Schema.decodeTo(Schema.optional(Schema.Number), {
    decode: SchemaGetter.transform((value) => {
      const milliseconds = Number(value);
      if (Number.isNaN(milliseconds) || milliseconds <= 0) return undefined;
      return Math.floor(milliseconds / MS_PER_SECOND);
    }),
    encode: SchemaGetter.transform((value) => (value ?? 0) * MS_PER_SECOND),
  }),
);

const FirefoxSameSite = Schema.Union([Schema.Number, Schema.BigInt, Schema.String]).pipe(
  Schema.decodeTo(Schema.optional(SameSitePolicy), {
    decode: SchemaGetter.transform((value) => {
      const numeric = Number(value);
      if (numeric === SAME_SITE_STRICT) return "Strict" as const;
      if (numeric === SAME_SITE_LAX) return "Lax" as const;
      if (numeric === SAME_SITE_NONE) return "None" as const;
      return undefined;
    }),
    encode: SchemaGetter.transform((value) => {
      if (value === "Strict") return SAME_SITE_STRICT;
      if (value === "Lax") return SAME_SITE_LAX;
      return SAME_SITE_NONE;
    }),
  }),
);

const FirefoxCookieRow = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  host: Schema.String,
  path: Schema.String,
  expiry: FirefoxExpiry,
  isSecure: SqliteBool,
  isHttpOnly: SqliteBool,
  sameSite: FirefoxSameSite,
});

const firefoxRowToCookie = (row: typeof FirefoxCookieRow.Type) =>
  Cookie.make({
    name: row.name,
    value: row.value,
    domain: row.host,
    path: row.path || "/",
    expires: row.expiry,
    secure: row.isSecure,
    httpOnly: row.isHttpOnly,
    sameSite: row.sameSite,
  });

export class Cookies extends ServiceMap.Service<Cookies>()("@cookies/Cookies", {
  make: Effect.gen(function* () {
    const cdpClient = yield* CdpClient;
    const sqliteClient = yield* SqliteClient;
    const sqliteFallback = yield* ChromiumSqliteFallback;
    const fs = yield* FileSystem.FileSystem;

    const extractChromium = (browser: Extract<Browser, { _tag: "ChromiumBrowser" }>) =>
      cdpClient
        .extractCookies({
          key: browser.key,
          profilePath: browser.profilePath,
          executablePath: browser.executablePath,
        })
        .pipe(
          Effect.catchTags({
            TimeoutError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            SchemaError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            SocketError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            HttpClientError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            PlatformError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
          }),
          Effect.catchTag("ExtractionError", (cdpError) =>
            Effect.gen(function* () {
              yield* Effect.logWarning("CDP extraction failed, trying SQLite fallback", {
                browser: browser.key,
                error: cdpError.message,
              });
              return yield* sqliteFallback.extract(browser);
            }).pipe(Effect.catchTag("ExtractionError", () => cdpError.asEffect())),
          ),
        );

    const extractFirefox = (browser: Extract<Browser, { _tag: "FirefoxBrowser" }>) =>
      Effect.gen(function* () {
        const cookieDbPath = path.join(browser.profilePath, "cookies.sqlite");
        const { tempDatabasePath } = yield* sqliteClient.copyToTemp(
          cookieDbPath,
          "cookies-firefox-",
          "cookies.sqlite",
          "firefox",
        );

        const rows = yield* sqliteClient.query(
          tempDatabasePath,
          `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies ORDER BY expiry DESC`,
          "firefox",
        );

        return yield* Effect.forEach(rows, (row) =>
          Schema.decodeUnknownEffect(FirefoxCookieRow)(row).pipe(Effect.map(firefoxRowToCookie)),
        );
      }).pipe(
        Effect.scoped,
        Effect.catchTags({
          CookieReadError: (cause) =>
            new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
          CookieDatabaseCopyError: (cause) =>
            new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
          SchemaError: (cause) =>
            new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
        }),
      );

    const extractSafari = (browser: Extract<Browser, { _tag: "SafariBrowser" }>) =>
      Effect.gen(function* () {
        if (Option.isNone(browser.cookieFilePath)) {
          return yield* new ExtractionError({
            reason: new RequiresFullDiskAccess(),
          }).asEffect();
        }

        const data = yield* fs.readFile(browser.cookieFilePath.value);
        return parseBinaryCookies(Buffer.from(data)).filter(
          (cookie) => Boolean(cookie.name) && Boolean(cookie.domain),
        );
      }).pipe(
        Effect.catchTags({
          PlatformError: (cause) =>
            new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
        }),
      );

    const extract = (browser: Browser) =>
      Match.valueTags(browser, {
        ChromiumBrowser: extractChromium,
        FirefoxBrowser: extractFirefox,
        SafariBrowser: extractSafari,
      });

    return { extract } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make).pipe(
    Layer.provide(CdpClient.layer),
    Layer.provide(SqliteClient.layer),
    Layer.provide(ChromiumSqliteFallback.layer),
    Layer.provide(NodeServices.layer),
  );

  static layerTest = Layer.effect(this, this.make).pipe(
    Layer.provide(CdpClient.layerTest),
    Layer.provide(SqliteClient.layer),
    Layer.provide(ChromiumSqliteFallback.layer),
    Layer.provide(NodeServices.layer),
  );
}
