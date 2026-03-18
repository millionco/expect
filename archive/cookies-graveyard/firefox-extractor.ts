/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import { homedir, platform } from "node:os";
import path from "node:path";
import { Effect, Layer, Match, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { NodeServices } from "@effect/platform-node";
import { getEpochSeconds } from "@browser-tester/utils";
import { FIREFOX_CONFIG } from "./browser-config";
import { CookieDatabaseNotFoundError } from "./errors";
import { SqliteClient } from "./sqlite-client";
import { stripLeadingDot } from "./utils/host-matching";
import { normalizeSameSite, parseFirefoxExpiry } from "./utils/normalize";
import { buildHostWhereClause, sqliteBool, stringField } from "./utils/sql-helpers";
import type { Cookie } from "./types";

const resolveCookieDbPath = Effect.fn("FirefoxExtractor.resolveCookieDbPath")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const home = homedir();
  const currentPlatform = platform();

  const roots = Match.value(currentPlatform).pipe(
    Match.when("darwin", () => [path.join(home, FIREFOX_CONFIG.dataDir.darwin, "Profiles")]),
    Match.when("linux", () => [path.join(home, FIREFOX_CONFIG.dataDir.linux)]),
    Match.when("win32", () => [path.join(home, FIREFOX_CONFIG.dataDir.win32, "Profiles")]),
    Match.orElse(() => []),
  );

  for (const root of roots) {
    const dirExists = yield* fileSystem.exists(root);
    if (!dirExists) continue;

    const entries = yield* fileSystem.readDirectory(root);
    const picked = entries.find((entry) => entry.includes("default-release")) ?? entries[0];
    if (!picked) continue;

    const candidate = path.join(root, picked, "cookies.sqlite");
    if (yield* fileSystem.exists(candidate)) return candidate;
  }

  return yield* new CookieDatabaseNotFoundError({ browser: "firefox" }).asEffect();
});

export class FirefoxExtractor extends ServiceMap.Service<FirefoxExtractor>()(
  "@cookies/FirefoxExtractor",
  {
    make: Effect.gen(function* () {
      const sqliteClient = yield* SqliteClient;

      const extract = Effect.fn("FirefoxExtractor.extract")(function* (
        hosts: string[],
        options: {
          names?: string[];
          includeExpired?: boolean;
        } = {},
      ) {
        yield* Effect.annotateCurrentSpan({ browser: "firefox" });

        const databasePath = yield* resolveCookieDbPath();
        const { tempDatabasePath } = yield* sqliteClient.copyToTemp(
          databasePath,
          "cookies-firefox-",
          "cookies.sqlite",
          "firefox",
        );

        const whereClause = buildHostWhereClause(hosts, "host");
        const currentTime = getEpochSeconds();
        const expiryClause = options.includeExpired
          ? ""
          : ` AND (expiry = 0 OR expiry > ${currentTime})`;

        const sqlQuery =
          `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite ` +
          `FROM moz_cookies WHERE (${whereClause})${expiryClause} ORDER BY expiry DESC`;

        const cookieRows = yield* sqliteClient.query(tempDatabasePath, sqlQuery, "firefox");
        const allowlist = options.names ? new Set(options.names) : undefined;
        const cookies: Cookie[] = [];

        for (const cookieRow of cookieRows) {
          const cookieName = stringField(cookieRow.name);
          const cookieValue = stringField(cookieRow.value);
          const cookieHost = stringField(cookieRow.host);

          if (!cookieName || cookieValue === undefined || !cookieHost) continue;
          if (allowlist && !allowlist.has(cookieName)) continue;

          const expires = parseFirefoxExpiry(cookieRow.expiry);
          if (!options.includeExpired && expires && expires < currentTime) continue;

          cookies.push({
            name: cookieName,
            value: cookieValue,
            domain: stripLeadingDot(cookieHost),
            path: stringField(cookieRow.path) || "/",
            expires,
            secure: sqliteBool(cookieRow.isSecure),
            httpOnly: sqliteBool(cookieRow.isHttpOnly),
            sameSite: normalizeSameSite(cookieRow.sameSite),
            browser: "firefox",
          });
        }

        yield* Effect.logInfo("Firefox cookies extracted", { count: cookies.length });
        return cookies;
      }, Effect.scoped);

      return { extract } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(SqliteClient.layer),
    Layer.provide(NodeServices.layer),
  );
}
