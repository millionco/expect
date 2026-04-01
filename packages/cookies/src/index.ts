export { Cookies } from "./cookies";
export { Browsers } from "./browser-detector";
export { CdpClient } from "./cdp-client";
export { SqliteClient, SqliteEngine } from "./sqlite-client";
export { ChromiumSource, ChromiumPlatform } from "./chromium";
export { FirefoxSource, FirefoxPlatform } from "./firefox";
export { SafariSource, SafariPlatform } from "./safari";
export { layerLive } from "./layers";

export {
  ExtractionError,
  RequiresFullDiskAccess,
  ListBrowsersError,
  CookieDatabaseNotFoundError,
  CookieDatabaseCopyError,
  CookieDecryptionKeyError,
  CookieReadError,
  CdpConnectionError,
  BrowserSpawnError,
  UnsupportedPlatformError,
  UnsupportedBrowserError,
  UnknownError,
} from "./errors";

export { BROWSER_CONFIGS, configByKey } from "./browser-config";

export {
  BrowserKey,
  ChromiumBrowserKey,
  ChromiumBrowser,
  FirefoxBrowser,
  SafariBrowser,
  Browser,
  Cookie,
  SameSitePolicy,
  browserKeyOf,
} from "./types";

export type { ExtractOptions } from "./types";

import { configByKey } from "./browser-config";
import { browserKeyOf, type Browser } from "./types";

export const browserDisplayName = (browser: Browser): string => {
  const config = configByKey(browserKeyOf(browser));
  return config?.displayName ?? browserKeyOf(browser);
};
