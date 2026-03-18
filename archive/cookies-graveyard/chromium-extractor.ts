/**
 * @deprecated ARCHIVED / DEAD CODE
 * Do not import, pattern-match on, or reference this code in new work.
 * Kept only as reference for browser SQLite decryption and cookie extraction logic.
 */

import { homedir, platform } from "node:os";
import path from "node:path";
import { Effect, Layer, Match, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { NodeServices } from "@effect/platform-node";
import { getEpochSeconds } from "@browser-tester/utils";
import { chromiumConfig } from "./browser-config";
import { decryptAes128Cbc, decryptAes256Gcm, deriveKey } from "./utils/crypto";
import {
  CookieDatabaseNotFoundError,
  CookieDecryptionKeyError,
  UnsupportedPlatformError,
} from "./errors";
import { SqliteClient } from "./sqlite-client";
import { stripLeadingDot } from "./utils/host-matching";
import { normalizeExpiration, normalizeSameSite } from "./utils/normalize";
import { buildHostWhereClause, sqliteBool, stringField } from "./utils/sql-helpers";
import type { ChromiumBrowser, Cookie } from "./types";

const CHROMIUM_META_VERSION_HASH_PREFIX = 24;
const DPAPI_PREFIX_LENGTH_BYTES = 5;
const PBKDF2_ITERATIONS_DARWIN = 1003;
const PBKDF2_ITERATIONS_LINUX = 1;

const resolveCookieDbPath = Effect.fn("ChromiumExtractor.resolveCookieDbPath")(function* (
  browser: ChromiumBrowser,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const config = chromiumConfig(browser);
  const relativePath = Match.value(platform()).pipe(
    Match.when("darwin", () => config.cookieRelativePath.darwin),
    Match.when("linux", () => config.cookieRelativePath.linux),
    Match.when("win32", () => config.cookieRelativePath.win32),
    Match.orElse(() => undefined),
  );
  if (!relativePath) {
    return yield* new UnsupportedPlatformError({ platform: platform() }).asEffect();
  }

  const profileDir = path.join(homedir(), relativePath);
  const networkPath = path.join(profileDir, "Network", "Cookies");
  if (yield* fileSystem.exists(networkPath)) return networkPath;
  const legacyPath = path.join(profileDir, "Cookies");
  if (yield* fileSystem.exists(legacyPath)) return legacyPath;
  return yield* new CookieDatabaseNotFoundError({ browser }).asEffect();
});

const getKeychainPassword = Effect.fn("ChromiumExtractor.getKeychainPassword")(function* (
  browser: ChromiumBrowser,
) {
  const config = chromiumConfig(browser);
  const spawner = yield* ChildProcessSpawner;
  const password = yield* spawner
    .string(
      ChildProcess.make("security", ["find-generic-password", "-w", "-s", config.keychainService]),
    )
    .pipe(
      Effect.map((output) => output.trim()),
      Effect.catchTag("PlatformError", () =>
        new CookieDecryptionKeyError({ browser, platform: "darwin" }).asEffect(),
      ),
    );
  if (!password) {
    return yield* new CookieDecryptionKeyError({ browser, platform: "darwin" }).asEffect();
  }
  return password;
});

const getLinuxPassword = Effect.fn("ChromiumExtractor.getLinuxPassword")(function* (
  browser: ChromiumBrowser,
) {
  const config = chromiumConfig(browser);
  const spawner = yield* ChildProcessSpawner;
  const lookups = [
    ["secret-tool", "lookup", "application", config.linuxSecretLabel],
    ["secret-tool", "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2"],
    ["secret-tool", "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v1"],
  ];

  for (const args of lookups) {
    const command = args[0]!;
    const commandArgs = args.slice(1);
    const result = yield* spawner.string(ChildProcess.make(command, commandArgs)).pipe(
      Effect.map((output) => output.trim()),
      Effect.catch(() => Effect.succeed("")),
    );
    if (result) return result;
  }

  return "peanuts";
});

const getWindowsMasterKey = Effect.fn("ChromiumExtractor.getWindowsMasterKey")(function* (
  browser: ChromiumBrowser,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner;
  const config = chromiumConfig(browser);
  const localStatePath = path.join(homedir(), config.localStatePath);

  const localStateContent = yield* fileSystem
    .readFileString(localStatePath)
    .pipe(
      Effect.catchTag("PlatformError", () =>
        new CookieDecryptionKeyError({ browser, platform: "win32" }).asEffect(),
      ),
    );

  const localState = yield* Effect.try({
    try: () => JSON.parse(localStateContent),
    catch: () => new CookieDecryptionKeyError({ browser, platform: "win32" }),
  });

  const encodedKey = localState?.os_crypt?.encrypted_key;
  if (typeof encodedKey !== "string") {
    return yield* new CookieDecryptionKeyError({ browser, platform: "win32" }).asEffect();
  }

  const encryptedKey = Buffer.from(encodedKey, "base64");
  const base64Key = encryptedKey.subarray(DPAPI_PREFIX_LENGTH_BYTES).toString("base64");

  const psCommand = `Add-Type -AssemblyName System.Security; $encrypted = [Convert]::FromBase64String('${base64Key}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, 'CurrentUser'); [Convert]::ToBase64String($decrypted)`;
  const result = yield* spawner
    .string(ChildProcess.make("powershell", ["-Command", psCommand]))
    .pipe(
      Effect.map((output) => output.trim()),
      Effect.catchTag("PlatformError", () =>
        new CookieDecryptionKeyError({ browser, platform: "win32" }).asEffect(),
      ),
    );
  if (!result) {
    return yield* new CookieDecryptionKeyError({ browser, platform: "win32" }).asEffect();
  }

  return Buffer.from(result, "base64");
});

const buildDecryptor = Effect.fn("ChromiumExtractor.buildDecryptor")(function* (
  browser: ChromiumBrowser,
  stripHashPrefix: boolean,
) {
  const currentPlatform = platform();

  return yield* Match.value(currentPlatform).pipe(
    Match.when("darwin", () =>
      Effect.gen(function* () {
        const password = yield* getKeychainPassword(browser);
        const key = deriveKey(password, PBKDF2_ITERATIONS_DARWIN);
        return (encrypted: Uint8Array) => decryptAes128Cbc(encrypted, [key], stripHashPrefix);
      }),
    ),
    Match.when("linux", () =>
      Effect.gen(function* () {
        const password = yield* getLinuxPassword(browser);
        const keys = new Set<string>([password, "peanuts", ""]);
        const candidates = Array.from(keys).map((candidateKey) =>
          deriveKey(candidateKey, PBKDF2_ITERATIONS_LINUX),
        );
        return (encrypted: Uint8Array) => decryptAes128Cbc(encrypted, candidates, stripHashPrefix);
      }),
    ),
    Match.when("win32", () =>
      Effect.gen(function* () {
        const masterKey = yield* getWindowsMasterKey(browser);
        return (encrypted: Uint8Array) => decryptAes256Gcm(encrypted, masterKey, stripHashPrefix);
      }),
    ),
    Match.orElse(() => new UnsupportedPlatformError({ platform: currentPlatform }).asEffect()),
  );
});

export class ChromiumExtractor extends ServiceMap.Service<ChromiumExtractor>()(
  "@cookies/ChromiumExtractor",
  {
    make: Effect.gen(function* () {
      const sqliteClient = yield* SqliteClient;

      const readMetaVersion = Effect.fn("ChromiumExtractor.readMetaVersion")(function* (
        databasePath: string,
      ) {
        const rows = yield* sqliteClient
          .query(databasePath, "SELECT value FROM meta WHERE key = 'version'", "chrome")
          .pipe(
            Effect.catchTag("CookieReadError", () =>
              Effect.succeed([] as Array<Record<string, unknown>>),
            ),
          );
        const value = rows[0]?.value;
        if (typeof value === "number") return Math.floor(value);
        if (typeof value === "bigint") return Math.floor(Number(value));
        if (typeof value === "string") {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      });

      const extract = Effect.fn("ChromiumExtractor.extract")(function* (
        browser: ChromiumBrowser,
        hosts: string[],
        options: {
          names?: string[];
          includeExpired?: boolean;
        } = {},
      ) {
        yield* Effect.annotateCurrentSpan({ browser });

        const databasePath = yield* resolveCookieDbPath(browser);
        const { tempDatabasePath } = yield* sqliteClient.copyToTemp(
          databasePath,
          `cookies-${browser}-`,
          "Cookies",
          browser,
        );

        const metaVersion = yield* readMetaVersion(tempDatabasePath);
        const stripHashPrefix = metaVersion >= CHROMIUM_META_VERSION_HASH_PREFIX;
        const decryptValue = yield* buildDecryptor(browser, stripHashPrefix);

        const whereClause = buildHostWhereClause(hosts, "host_key");
        const sql =
          `SELECT name, value, host_key, path, expires_utc, samesite, ` +
          `encrypted_value, is_secure, is_httponly ` +
          `FROM cookies WHERE (${whereClause}) ORDER BY expires_utc DESC`;

        const cookieRows = yield* sqliteClient.query(tempDatabasePath, sql, browser);
        const allowlist = options.names ? new Set(options.names) : undefined;
        const currentTime = getEpochSeconds();
        const cookies: Cookie[] = [];

        for (const cookieRow of cookieRows) {
          const cookieName = stringField(cookieRow.name);
          if (!cookieName) continue;
          if (allowlist && !allowlist.has(cookieName)) continue;

          const hostKey = stringField(cookieRow.host_key);
          if (!hostKey) continue;

          let cookieValue = stringField(cookieRow.value);
          if (!cookieValue || cookieValue.length === 0) {
            const encrypted =
              cookieRow.encrypted_value instanceof Uint8Array
                ? cookieRow.encrypted_value
                : undefined;
            if (!encrypted) continue;
            const decrypted = decryptValue(encrypted);
            if (decrypted === undefined) continue;
            cookieValue = decrypted;
          }

          const rawExpiry = cookieRow.expires_utc;
          const expires = normalizeExpiration(
            typeof rawExpiry === "number" ||
              typeof rawExpiry === "bigint" ||
              typeof rawExpiry === "string"
              ? rawExpiry
              : undefined,
          );

          if (!options.includeExpired && expires && expires < currentTime) continue;

          cookies.push({
            name: cookieName,
            value: cookieValue,
            domain: stripLeadingDot(hostKey),
            path: stringField(cookieRow.path) || "/",
            expires,
            secure: sqliteBool(cookieRow.is_secure),
            httpOnly: sqliteBool(cookieRow.is_httponly),
            sameSite: normalizeSameSite(cookieRow.samesite),
            browser,
          });
        }

        yield* Effect.logInfo("Chromium cookies extracted", { browser, count: cookies.length });
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
