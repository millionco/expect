# @browser-tester/cookies

Extract cookies from local browsers for use in automated testing.

## Install

```bash
pnpm add @browser-tester/cookies
```

## Quick Start

Extract cookies for a URL from your installed browsers:

```ts
import { extractCookies, CookieJar } from "@browser-tester/cookies";

const { cookies } = await extractCookies({ url: "https://github.com" });

const jar = new CookieJar(cookies);
jar.toCookieHeader("https://github.com"); // "session=abc; user=xyz"
jar.toPlaywright(); // ready for Playwright's addCookies()
jar.toPuppeteer(); // ready for Puppeteer's setCookie()
```

Extract cookies from a specific browser profile:

```ts
import { detectBrowserProfiles, extractProfileCookies } from "@browser-tester/cookies";

const profiles = detectBrowserProfiles({ browser: "chrome" });
const { cookies } = await extractProfileCookies({ profile: profiles[0] });
```

Detect the system default browser:

```ts
import { detectDefaultBrowser } from "@browser-tester/cookies";

const browser = await detectDefaultBrowser(); // "chrome" | "safari" | ... | null
```

---

## API Reference

### `extractCookies(options)`

Reads cookies from browser SQLite databases on disk. Searches multiple browsers in parallel and deduplicates results.

```ts
const { cookies, warnings } = await extractCookies({
  url: "https://github.com",
  browsers: ["chrome", "firefox"],
  names: ["session"],
  includeExpired: false,
  timeoutMs: 5000,
  onKeychainAccess: async (browser) => {
    console.log(`Requesting credential access for ${browser}...`);
  },
});
```

| Option             | Type                | Default                                              | Description                    |
| ------------------ | ------------------- | ---------------------------------------------------- | ------------------------------ |
| `url`              | `string`            | required                                             | URL to match cookies against   |
| `browsers`         | `Browser[]`         | `["chrome","brave","edge","arc","firefox","safari"]` | Browsers to search             |
| `names`            | `string[]`          | all                                                  | Filter by cookie name          |
| `includeExpired`   | `boolean`           | `false`                                              | Include expired cookies        |
| `timeoutMs`        | `number`            | `5000`                                               | Keychain/DPAPI command timeout |
| `onKeychainAccess` | `(browser) => void` | -                                                    | Fires before credential prompt |

Supported browsers: `chrome` `edge` `brave` `arc` `dia` `helium` `chromium` `vivaldi` `opera` `ghost` `sidekick` `yandex` `iridium` `thorium` `sigmaos` `wavebox` `comet` `blisk` `firefox` `safari`

### `detectBrowserProfiles(options?)`

Detects installed browser profiles across Chromium, Firefox, and Safari.

```ts
const allProfiles = detectBrowserProfiles();
const chromeOnly = detectBrowserProfiles({ browser: "chrome" });
```

| Option    | Type      | Default | Description                  |
| --------- | --------- | ------- | ---------------------------- |
| `browser` | `Browser` | all     | Filter to a specific browser |

Returns `BrowserProfile[]`.

### `extractProfileCookies(options)`

Extracts all cookies from a browser profile. Chromium browsers are launched headless via CDP. Firefox and Safari profiles are read directly from disk.

```ts
const { cookies, warnings } = await extractProfileCookies({
  profile: profiles[0],
  port: 9222,
});
```

| Option    | Type             | Default  | Description                          |
| --------- | ---------------- | -------- | ------------------------------------ |
| `profile` | `BrowserProfile` | required | Profile from `detectBrowserProfiles` |
| `port`    | `number`         | `9222`   | CDP debugging port (Chromium only)   |

### `extractAllProfileCookies(profiles)`

Extracts cookies from multiple profiles sequentially, aggregating results.

```ts
const { cookies, warnings } = await extractAllProfileCookies(profiles);
```

### `CookieJar`

Wraps a `Cookie[]` with matching, conversion, and serialization.

| Method                | Returns              | Description                                            |
| --------------------- | -------------------- | ------------------------------------------------------ |
| `match(url)`          | `Cookie[]`           | Cookies matching domain, path, secure flag, and expiry |
| `toCookieHeader(url)` | `string`             | `"name=value; name2=value2"` for matched cookies       |
| `toPlaywright()`      | `PlaywrightCookie[]` | Playwright format (sameSite defaults to `"Lax"`)       |
| `toPuppeteer()`       | `PuppeteerCookie[]`  | Puppeteer format                                       |
| `toJSON()`            | `string`             | Serialize to JSON                                      |
| `fromJSON(json)`      | `CookieJar`          | Static deserializer                                    |

### `toCookieHeader(cookies)`

Formats a `Cookie[]` as a header string without URL matching.

```ts
toCookieHeader(cookies); // "name=value; name2=value2"
```

### `detectDefaultBrowser()`

Returns the system default browser key, or `null` if detection fails.

```ts
const browser = await detectDefaultBrowser(); // "chrome" | "safari" | ... | null
```

### Types

```ts
interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  browser: Browser;
}

interface ExtractResult {
  cookies: Cookie[];
  warnings: string[];
}

interface BrowserProfile {
  profileName: string;
  profilePath: string;
  displayName: string;
  browser: BrowserInfo;
}

interface BrowserInfo {
  name: string;
  executablePath: string;
}
```

### SQLite vs Profile Extraction

|                            | SQLite                   | Profile                               |
| -------------------------- | ------------------------ | ------------------------------------- |
| Speed                      | Fast (no browser launch) | ~3s startup (Chromium), fast (others) |
| Keychain popup (macOS)     | Yes                      | No                                    |
| Firefox/Safari             | Yes                      | Yes                                   |
| Requires browser installed | No (reads DB files)      | Yes                                   |
| Cookie decryption          | Manual (keychain/DPAPI)  | Chromium handles it / not needed      |
