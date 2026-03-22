# @browser-tester/cookies

Extract cookies from local browsers using Effect services. Supports Chromium, Firefox, and Safari on macOS, Linux, and Windows.

## Install

```bash
pnpm add @browser-tester/cookies
```

## Quick Start

The package exposes Effect services. Use `Cookies` to extract cookies from a browser profile, and `Browsers` to discover installed browsers.

```ts
import { Effect } from "effect";
import { Cookies, Browsers, layerLive } from "@browser-tester/cookies";

const program = Effect.gen(function* () {
  const browsers = yield* Browsers;
  const cookies = yield* Cookies;

  const profiles = yield* browsers.list;
  const extracted = yield* cookies.extract(profiles[0]);

  return extracted;
});

Effect.runPromise(program.pipe(Effect.provide(layerLive), Effect.provide(Cookies.layer)));
```

## Services

### `Cookies`

Extracts cookies from a single browser profile. Chromium browsers use CDP with SQLite fallback. Firefox and Safari read directly from disk.

```ts
import { Cookies } from "@browser-tester/cookies";

const cookies = yield * Cookies;
const extracted: Cookie[] = yield * cookies.extract(browserProfile);
```

### `Browsers`

Discovers installed browser profiles across all supported browser engines.

```ts
import { Browsers } from "@browser-tester/cookies";

const browsers = yield * Browsers;
const profiles: Browser[] = yield * browsers.list;
const defaultBrowser: Option<Browser> = yield * browsers.defaultBrowser();
```

| Method           | Returns           | Description                                 |
| ---------------- | ----------------- | ------------------------------------------- |
| `list`           | `Browser[]`       | All detected browser profiles               |
| `defaultBrowser` | `Option<Browser>` | System default browser profile, if detected |
| `register`       | `void`            | Register a browser source for discovery     |

### `CdpClient`

Low-level CDP client for extracting cookies from Chromium browsers via DevTools Protocol.

### `SqliteClient` / `SqliteEngine`

SQLite access layer for reading browser cookie databases.

### Platform Sources

| Service            | Description                                     |
| ------------------ | ----------------------------------------------- |
| `ChromiumSource`   | Discovers Chromium-based browser profiles       |
| `ChromiumPlatform` | Platform-specific Chromium paths and decryption |
| `FirefoxSource`    | Discovers Firefox profiles                      |
| `FirefoxPlatform`  | Platform-specific Firefox paths                 |
| `SafariSource`     | Discovers Safari cookie files                   |
| `SafariPlatform`   | Platform-specific Safari paths                  |

## Layer

### `layerLive`

Pre-wired layer that auto-detects the current platform and registers all browser sources.

```ts
import { layerLive } from "@browser-tester/cookies";

Effect.provide(program, layerLive);
```

## Types

### `Cookie`

```ts
class Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "Strict" | "Lax" | "None";

  get playwrightFormat(): { ... };
}
```

### `Browser`

Tagged union of browser profile types:

```ts
type Browser = ChromiumBrowser | FirefoxBrowser | SafariBrowser;
```

```ts
class ChromiumBrowser {
  _tag: "ChromiumBrowser";
  key: ChromiumBrowserKey;
  profileName: string;
  profilePath: string;
  executablePath: string;
  locale?: string;
}

class FirefoxBrowser {
  _tag: "FirefoxBrowser";
  profileName: string;
  profilePath: string;
}

class SafariBrowser {
  _tag: "SafariBrowser";
  cookieFilePath: Option<string>;
}
```

### `BrowserKey`

Union of all supported browser identifiers:

`chrome` `edge` `brave` `arc` `dia` `helium` `chromium` `vivaldi` `opera` `ghost` `sidekick` `yandex` `iridium` `thorium` `sigmaos` `wavebox` `comet` `blisk` `firefox` `safari`

### Other Exports

| Export               | Kind     | Description                            |
| -------------------- | -------- | -------------------------------------- |
| `ChromiumBrowserKey` | Schema   | Subset of `BrowserKey` for Chromium    |
| `SameSitePolicy`     | Schema   | `"Strict" \| "Lax" \| "None"`          |
| `BROWSER_CONFIGS`    | Constant | Configuration map for all browsers     |
| `configByKey`        | Function | Look up browser config by `BrowserKey` |
| `ExtractOptions`     | Type     | Options for cookie extraction          |

## Errors

| Error                         | Description                            |
| ----------------------------- | -------------------------------------- |
| `ExtractionError`             | Wrapper with `reason` sub-error        |
| `RequiresFullDiskAccess`      | Safari needs Full Disk Access on macOS |
| `ListBrowsersError`           | Failed to discover browsers            |
| `CookieDatabaseNotFoundError` | Cookie DB missing for a browser        |
| `CookieDatabaseCopyError`     | Failed to copy DB to temp directory    |
| `CookieDecryptionKeyError`    | Decryption key not available           |
| `CookieReadError`             | SQLite query failed                    |
| `BinaryParseError`            | Safari binary cookie parsing failed    |
| `CdpConnectionError`          | CDP WebSocket connection failed        |
| `BrowserSpawnError`           | Failed to spawn headless browser       |
| `UnsupportedPlatformError`    | OS not supported                       |
| `UnsupportedBrowserError`     | Browser engine not recognized          |
| `UnknownError`                | Catch-all for unexpected failures      |
