import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { querySqlite } from "../sqlite/adapter.js";
import { parseBinaryCookies } from "../sqlite/safari.js";
import type { BrowserProfile, Cookie, ExtractProfileOptions, ExtractResult } from "../types.js";
import { browserDisplayNameToKey } from "../utils/browser-name-map.js";
import { copyDatabaseToTemp } from "../utils/copy-database.js";
import { formatWarning } from "../utils/format-warning.js";
import { normalizeSameSite } from "../utils/normalize-same-site.js";
import { parseFirefoxExpiry } from "../utils/parse-firefox-expiry.js";
import { sqliteBool } from "../utils/sql.js";
import { stringField } from "../utils/string-field.js";
import { stripLeadingDot } from "../utils/strip-leading-dot.js";
import { extractChromiumProfileCookies } from "./cdp-extract.js";

const FIREFOX_COOKIES_QUERY =
  "SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies";

const extractFirefoxProfileCookies = async (profile: BrowserProfile): Promise<ExtractResult> => {
  const warnings: string[] = [];
  const databasePath = path.join(profile.profilePath, "cookies.sqlite");

  let tempDir: string;
  let tempDatabasePath: string;
  try {
    ({ tempDir, tempDatabasePath } = copyDatabaseToTemp(
      databasePath,
      "cookies-firefox-profile-",
      "cookies.sqlite",
    ));
  } catch (error) {
    warnings.push(formatWarning("firefox", "failed to copy cookie database", error));
    return { cookies: [], warnings };
  }

  try {
    const cookieRows = await querySqlite(tempDatabasePath, FIREFOX_COOKIES_QUERY);
    const cookies: Cookie[] = [];

    for (const cookieRow of cookieRows) {
      const cookieName = stringField(cookieRow.name);
      const cookieValue = stringField(cookieRow.value);
      const cookieHost = stringField(cookieRow.host);

      if (!cookieName || cookieValue === null || !cookieHost) continue;

      cookies.push({
        name: cookieName,
        value: cookieValue,
        domain: stripLeadingDot(cookieHost),
        path: stringField(cookieRow.path) || "/",
        expires: parseFirefoxExpiry(cookieRow.expiry),
        secure: sqliteBool(cookieRow.isSecure),
        httpOnly: sqliteBool(cookieRow.isHttpOnly),
        sameSite: normalizeSameSite(cookieRow.sameSite),
        browser: "firefox",
      });
    }

    return { cookies, warnings };
  } catch (error) {
    warnings.push(formatWarning("firefox", "failed to read profile cookies", error));
    return { cookies: [], warnings };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const extractSafariProfileCookies = async (profile: BrowserProfile): Promise<ExtractResult> => {
  const warnings: string[] = [];
  const cookieFilePath = path.join(profile.profilePath, "Cookies.binarycookies");

  try {
    const data = readFileSync(cookieFilePath);
    const cookies = parseBinaryCookies(data);
    return {
      cookies: cookies.filter((cookie) => Boolean(cookie.name) && Boolean(cookie.domain)),
      warnings,
    };
  } catch (error) {
    warnings.push(formatWarning("safari", "failed to read profile cookies", error));
    return { cookies: [], warnings };
  }
};

export const extractProfileCookies = async (
  options: ExtractProfileOptions,
): Promise<ExtractResult> => {
  const browserKey = browserDisplayNameToKey(options.profile.browser.name);

  if (browserKey === "firefox") {
    return extractFirefoxProfileCookies(options.profile);
  }
  if (browserKey === "safari") {
    return extractSafariProfileCookies(options.profile);
  }

  return extractChromiumProfileCookies(options);
};

export const extractAllProfileCookies = async (
  profiles: BrowserProfile[],
): Promise<ExtractResult> => {
  const allCookies: Cookie[] = [];
  const allWarnings: string[] = [];

  for (const profile of profiles) {
    const result = await extractProfileCookies({ profile });
    allCookies.push(...result.cookies);
    allWarnings.push(...result.warnings);
  }

  return { cookies: allCookies, warnings: allWarnings };
};
