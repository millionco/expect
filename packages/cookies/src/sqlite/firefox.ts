import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { getEpochSeconds } from "@browser-tester/utils";
import type { Cookie, ExtractResult } from "../types.js";
import { copyDatabaseToTemp } from "../utils/copy-database.js";
import { formatWarning } from "../utils/format-warning.js";
import { normalizeSameSite } from "../utils/normalize-same-site.js";
import { parseFirefoxExpiry } from "../utils/parse-firefox-expiry.js";
import { buildHostWhereClause, sqliteBool } from "../utils/sql.js";
import { stringField } from "../utils/string-field.js";
import { stripLeadingDot } from "../utils/strip-leading-dot.js";
import { querySqlite } from "./adapter.js";

const resolveCookieDbPath = (): string | null => {
  const home = homedir();
  const currentPlatform = platform();

  const roots =
    currentPlatform === "darwin"
      ? [path.join(home, "Library", "Application Support", "Firefox", "Profiles")]
      : currentPlatform === "linux"
        ? [path.join(home, ".mozilla", "firefox")]
        : currentPlatform === "win32"
          ? [path.join(home, "AppData", "Roaming", "Mozilla", "Firefox", "Profiles")]
          : [];

  for (const root of roots) {
    try {
      const entries = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const picked = entries.find((entry) => entry.includes("default-release")) ?? entries[0];
      if (!picked) continue;

      const candidate = path.join(root, picked, "cookies.sqlite");
      if (existsSync(candidate)) return candidate;
    } catch {
      continue;
    }
  }

  return null;
};

export const extractFirefoxCookies = async (
  hosts: string[],
  options: {
    names?: string[];
    includeExpired?: boolean;
  } = {},
): Promise<ExtractResult> => {
  const warnings: string[] = [];
  const databasePath = resolveCookieDbPath();

  if (!databasePath) {
    warnings.push("firefox: cookie database not found");
    return { cookies: [], warnings };
  }

  let tempDir: string;
  let tempDatabasePath: string;
  try {
    ({ tempDir, tempDatabasePath } = copyDatabaseToTemp(
      databasePath,
      "cookies-firefox-",
      "cookies.sqlite",
    ));
  } catch (error) {
    warnings.push(formatWarning("firefox", "failed to copy cookie database", error));
    return { cookies: [], warnings };
  }

  try {
    const whereClause = buildHostWhereClause(hosts, "host");
    const currentTime = getEpochSeconds();
    const expiryClause = options.includeExpired
      ? ""
      : ` AND (expiry = 0 OR expiry > ${currentTime})`;

    const sqlQuery =
      `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite ` +
      `FROM moz_cookies WHERE (${whereClause})${expiryClause} ORDER BY expiry DESC`;

    const cookieRows = await querySqlite(tempDatabasePath, sqlQuery);
    const allowlist = options.names ? new Set(options.names) : null;
    const cookies: Cookie[] = [];

    for (const cookieRow of cookieRows) {
      const cookieName = stringField(cookieRow.name);
      const cookieValue = stringField(cookieRow.value);
      const cookieHost = stringField(cookieRow.host);

      if (!cookieName || cookieValue === null || !cookieHost) continue;
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

    return { cookies, warnings };
  } catch (error) {
    warnings.push(formatWarning("firefox", "failed to read cookies", error));
    return { cookies: [], warnings };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
