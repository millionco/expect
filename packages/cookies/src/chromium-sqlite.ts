// HACK: Fallback for Chromium cookie extraction when CDP (headless browser) fails.
// Reads the SQLite cookie database directly and decrypts values using
// platform-specific key retrieval (macOS Keychain, Linux secret-tool, Windows DPAPI).
import * as path from "node:path";
import * as os from "node:os";
import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as FileSystem from "effect/FileSystem";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { chromiumConfig } from "./browser-config";
import { deriveKey, decryptAes128Cbc, decryptAes256Gcm } from "./utils/crypto";
import { normalizeChromiumExpiration, normalizeChromiumSameSite } from "./utils/chromium-normalize";
import {
  CookieDatabaseNotFoundError,
  CookieDecryptionKeyError,
  ExtractionError,
  UnknownError,
} from "./errors";
import { SqliteClient } from "./sqlite-client";
import { Cookie, type ChromiumBrowser, type ChromiumBrowserKey } from "./types";

const CHROMIUM_META_VERSION_HASH_PREFIX = 24;
const PBKDF2_ITERATIONS_DARWIN = 1003;
const PBKDF2_ITERATIONS_LINUX = 1;
const DPAPI_PREFIX_LENGTH_BYTES = 5;

const ChromiumLocalStateSchema = Schema.Struct({
  os_crypt: Schema.Struct({
    encrypted_key: Schema.String,
  }),
});

interface DecryptFn {
  (encrypted: Uint8Array): string | undefined;
}

export class ChromiumKeyProvider extends ServiceMap.Service<
  ChromiumKeyProvider,
  {
    readonly buildDecryptor: (
      browserKey: ChromiumBrowserKey,
      stripHashPrefix: boolean,
    ) => Effect.Effect<DecryptFn, CookieDecryptionKeyError>;
  }
>()("@cookies/ChromiumKeyProvider") {
  static layerDarwin = Layer.effect(this)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;

      const buildDecryptor = Effect.fn("ChromiumKeyProvider.buildDecryptor")(function* (
        browserKey: ChromiumBrowserKey,
        stripHashPrefix: boolean,
      ) {
        const config = chromiumConfig(browserKey);
        const password = yield* spawner
          .string(
            ChildProcess.make("security", [
              "find-generic-password",
              "-w",
              "-s",
              config.keychainService,
            ]),
          )
          .pipe(
            Effect.map((output) => output.trim()),
            Effect.catchTag("PlatformError", () =>
              new CookieDecryptionKeyError({
                browser: browserKey,
                platform: "darwin",
              }).asEffect(),
            ),
          );

        if (!password) {
          return yield* new CookieDecryptionKeyError({
            browser: browserKey,
            platform: "darwin",
          }).asEffect();
        }

        const key = deriveKey(password, PBKDF2_ITERATIONS_DARWIN);
        return ((encrypted: Uint8Array) =>
          decryptAes128Cbc(encrypted, [key], stripHashPrefix)) satisfies DecryptFn;
      });

      return { buildDecryptor } as const;
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerLinux = Layer.effect(this)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;

      const buildDecryptor = Effect.fn("ChromiumKeyProvider.buildDecryptor")(function* (
        browserKey: ChromiumBrowserKey,
        stripHashPrefix: boolean,
      ) {
        const config = chromiumConfig(browserKey);
        const lookups = [
          ["secret-tool", "lookup", "application", config.linuxSecretLabel],
          ["secret-tool", "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2"],
          ["secret-tool", "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v1"],
        ];

        let password = "";
        for (const args of lookups) {
          const command = args[0]!;
          const commandArgs = args.slice(1);
          const result = yield* spawner.string(ChildProcess.make(command, commandArgs)).pipe(
            Effect.map((output) => output.trim()),
            Effect.catchTag("PlatformError", () => Effect.succeed("")),
          );
          if (result) {
            password = result;
            break;
          }
        }

        if (!password) password = "peanuts";

        const keys = new Set<string>([password, "peanuts", ""]);
        const candidates = Array.from(keys).map((candidateKey) =>
          deriveKey(candidateKey, PBKDF2_ITERATIONS_LINUX),
        );
        return ((encrypted: Uint8Array) =>
          decryptAes128Cbc(encrypted, candidates, stripHashPrefix)) satisfies DecryptFn;
      });

      return { buildDecryptor } as const;
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerWin32 = Layer.effect(this)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const fileSystem = yield* FileSystem.FileSystem;

      const buildDecryptor = Effect.fn("ChromiumKeyProvider.buildDecryptor")(function* (
        browserKey: ChromiumBrowserKey,
        stripHashPrefix: boolean,
      ) {
        const config = chromiumConfig(browserKey);
        const localStatePath = path.join(os.homedir(), config.localStatePath);

        const localStateContent = yield* fileSystem.readFileString(localStatePath).pipe(
          Effect.catchTag("PlatformError", () =>
            new CookieDecryptionKeyError({
              browser: browserKey,
              platform: "win32",
            }).asEffect(),
          ),
        );

        const localState = yield* Effect.try({
          try: () =>
            Schema.decodeUnknownSync(ChromiumLocalStateSchema)(JSON.parse(localStateContent)),
          catch: () => new CookieDecryptionKeyError({ browser: browserKey, platform: "win32" }),
        });

        const encodedKey = localState.os_crypt.encrypted_key;

        const encryptedKey = Buffer.from(encodedKey, "base64");
        const base64Key = encryptedKey.subarray(DPAPI_PREFIX_LENGTH_BYTES).toString("base64");

        const psCommand = `Add-Type -AssemblyName System.Security; $encrypted = [Convert]::FromBase64String('${base64Key}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, 'CurrentUser'); [Convert]::ToBase64String($decrypted)`;
        const result = yield* spawner
          .string(ChildProcess.make("powershell", ["-Command", psCommand]))
          .pipe(
            Effect.map((output) => output.trim()),
            Effect.catchTag("PlatformError", () =>
              new CookieDecryptionKeyError({
                browser: browserKey,
                platform: "win32",
              }).asEffect(),
            ),
          );

        if (!result) {
          return yield* new CookieDecryptionKeyError({
            browser: browserKey,
            platform: "win32",
          }).asEffect();
        }

        const masterKey = Buffer.from(result, "base64");
        return ((encrypted: Uint8Array) =>
          decryptAes256Gcm(encrypted, masterKey, stripHashPrefix)) satisfies DecryptFn;
      });

      return { buildDecryptor } as const;
    }),
  ).pipe(Layer.provide(NodeServices.layer));
}

export class ChromiumSqliteFallback extends ServiceMap.Service<ChromiumSqliteFallback>()(
  "@cookies/ChromiumSqliteFallback",
  {
    make: Effect.gen(function* () {
      const sqliteClient = yield* SqliteClient;
      const fileSystem = yield* FileSystem.FileSystem;
      const keyProvider = yield* ChromiumKeyProvider;

      const resolveCookieDbPath = Effect.fn("ChromiumSqliteFallback.resolveCookieDbPath")(
        function* (profilePath: string, browserKey: string) {
          const networkPath = path.join(profilePath, "Network", "Cookies");
          if (yield* fileSystem.exists(networkPath)) return networkPath;

          const legacyPath = path.join(profilePath, "Cookies");
          if (yield* fileSystem.exists(legacyPath)) return legacyPath;

          return yield* new CookieDatabaseNotFoundError({ browser: browserKey }).asEffect();
        },
      );

      const readMetaVersion = Effect.fn("ChromiumSqliteFallback.readMetaVersion")(function* (
        databasePath: string,
      ) {
        const rows = yield* sqliteClient
          .query(databasePath, "SELECT value FROM meta WHERE key = 'version'", "chromium")
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

      const extractImpl = Effect.fn("ChromiumSqliteFallback.extract")(function* (
        browser: ChromiumBrowser,
      ) {
        yield* Effect.annotateCurrentSpan({ browser: browser.key });

        const databasePath = yield* resolveCookieDbPath(browser.profilePath, browser.key);
        const { tempDatabasePath } = yield* sqliteClient.copyToTemp(
          databasePath,
          `cookies-sqlite-${browser.key}-`,
          "Cookies",
          browser.key,
        );

        const metaVersion = yield* readMetaVersion(tempDatabasePath);
        const stripHashPrefix = metaVersion >= CHROMIUM_META_VERSION_HASH_PREFIX;
        const decryptValue = yield* keyProvider.buildDecryptor(browser.key, stripHashPrefix);

        const cookieRows = yield* sqliteClient.query(
          tempDatabasePath,
          `SELECT name, value, host_key, path, expires_utc, samesite, encrypted_value, is_secure, is_httponly FROM cookies ORDER BY expires_utc DESC`,
          browser.key,
        );

        const cookies: Cookie[] = [];
        for (const row of cookieRows) {
          const cookieName = typeof row.name === "string" ? row.name : undefined;
          if (!cookieName) continue;

          const hostKey = typeof row.host_key === "string" ? row.host_key : undefined;
          if (!hostKey) continue;

          let cookieValue = typeof row.value === "string" ? row.value : undefined;
          if (!cookieValue || cookieValue.length === 0) {
            const encrypted =
              row.encrypted_value instanceof Uint8Array ? row.encrypted_value : undefined;
            if (!encrypted) continue;
            const decrypted = decryptValue(encrypted);
            if (decrypted === undefined) continue;
            cookieValue = decrypted;
          }

          const rawExpiry = row.expires_utc;
          const expires = normalizeChromiumExpiration(
            typeof rawExpiry === "number" ||
              typeof rawExpiry === "bigint" ||
              typeof rawExpiry === "string"
              ? rawExpiry
              : undefined,
          );

          cookies.push(
            Cookie.make({
              name: cookieName,
              value: cookieValue,
              domain: hostKey,
              path: typeof row.path === "string" ? row.path : "/",
              ...(expires !== undefined ? { expires } : {}),
              secure: Number(row.is_secure) !== 0,
              httpOnly: Number(row.is_httponly) !== 0,
              sameSite: normalizeChromiumSameSite(row.samesite),
            }),
          );
        }

        yield* Effect.logInfo("Chromium SQLite fallback cookies extracted", {
          browser: browser.key,
          count: cookies.length,
        });

        return cookies;
      }, Effect.scoped);

      const extract = (browser: ChromiumBrowser) =>
        extractImpl(browser).pipe(
          Effect.catchTags({
            CookieDatabaseNotFoundError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            CookieDatabaseCopyError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            CookieReadError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            CookieDecryptionKeyError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
            PlatformError: (cause) =>
              new ExtractionError({ reason: new UnknownError({ cause }) }).asEffect(),
          }),
        );

      return { extract } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(SqliteClient.layer),
    Layer.provide(
      Layer.unwrap(
        Effect.sync(() => {
          const currentPlatform = os.platform();
          if (currentPlatform === "darwin") return ChromiumKeyProvider.layerDarwin;
          if (currentPlatform === "win32") return ChromiumKeyProvider.layerWin32;
          return ChromiumKeyProvider.layerLinux;
        }),
      ),
    ),
    Layer.provide(NodeServices.layer),
  );
}
