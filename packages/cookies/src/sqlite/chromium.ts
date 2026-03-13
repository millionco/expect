import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import type { ChromiumBrowser, Cookie, ExtractResult } from "../types.js";
import { execCommand, getEpochSeconds } from "@browser-tester/utils";
import { copyDatabaseToTemp } from "../utils/copy-database.js";
import { formatWarning } from "../utils/format-warning.js";
import { normalizeExpiration } from "../utils/normalize-expiration.js";
import { normalizeSameSite } from "../utils/normalize-same-site.js";
import { buildHostWhereClause, sqliteBool } from "../utils/sql.js";
import { stringField } from "../utils/string-field.js";
import { stripLeadingDot } from "../utils/strip-leading-dot.js";
import {
  CHROMIUM_META_VERSION_HASH_PREFIX,
  CHROMIUM_SQLITE_CONFIGS,
  DPAPI_PREFIX_LENGTH_BYTES,
  PBKDF2_ITERATIONS_DARWIN,
  PBKDF2_ITERATIONS_LINUX,
} from "./constants.js";
import { decryptAes128Cbc, decryptAes256Gcm, deriveKey } from "./crypto.js";
import { querySqlite } from "./adapter.js";

const resolveCookieDbPath = (browser: ChromiumBrowser): string | null => {
  const config = CHROMIUM_SQLITE_CONFIGS[browser];
  const relativePath = config.cookiePaths[platform()];
  if (!relativePath) return null;

  const profileDir = path.join(homedir(), relativePath);
  const networkPath = path.join(profileDir, "Network", "Cookies");
  if (existsSync(networkPath)) return networkPath;

  const legacyPath = path.join(profileDir, "Cookies");
  if (existsSync(legacyPath)) return legacyPath;

  return null;
};

const getKeychainPassword = (browser: ChromiumBrowser, timeoutMs?: number): string | null => {
  const config = CHROMIUM_SQLITE_CONFIGS[browser];
  return execCommand(`security find-generic-password -w -s "${config.keychainService}"`, timeoutMs);
};

const getLinuxPassword = (browser: ChromiumBrowser, timeoutMs?: number): string => {
  const config = CHROMIUM_SQLITE_CONFIGS[browser];
  const lookups = [
    `secret-tool lookup application ${config.linuxSecretLabel}`,
    "secret-tool lookup xdg:schema chrome_libsecret_os_crypt_password_v2",
    "secret-tool lookup xdg:schema chrome_libsecret_os_crypt_password_v1",
  ];

  for (const command of lookups) {
    const result = execCommand(command, timeoutMs);
    if (result) return result;
  }

  return "peanuts";
};

const getWindowsMasterKey = (browser: ChromiumBrowser, timeoutMs?: number): Buffer | null => {
  const config = CHROMIUM_SQLITE_CONFIGS[browser];
  const localStatePath = path.join(homedir(), config.localStatePath);

  try {
    const localState = JSON.parse(readFileSync(localStatePath, "utf-8"));
    const encodedKey = localState?.os_crypt?.encrypted_key;
    if (typeof encodedKey !== "string") return null;
    const encryptedKey = Buffer.from(encodedKey, "base64");
    const base64Key = encryptedKey.subarray(DPAPI_PREFIX_LENGTH_BYTES).toString("base64");

    const psCommand = `Add-Type -AssemblyName System.Security; $encrypted = [Convert]::FromBase64String('${base64Key}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, 'CurrentUser'); [Convert]::ToBase64String($decrypted)`;
    const result = execCommand(`powershell -Command "${psCommand}"`, timeoutMs);
    if (!result) return null;

    return Buffer.from(result, "base64");
  } catch {
    return null;
  }
};

const readMetaVersion = async (databasePath: string): Promise<number> => {
  try {
    const rows = await querySqlite(databasePath, "SELECT value FROM meta WHERE key = 'version'");
    const value = rows[0]?.value;
    if (typeof value === "number") return Math.floor(value);
    if (typeof value === "bigint") return Math.floor(Number(value));
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  } catch {
    return 0;
  }
};

export const extractChromiumCookies = async (
  browser: ChromiumBrowser,
  hosts: string[],
  options: {
    names?: string[];
    includeExpired?: boolean;
    timeoutMs?: number;
    onKeychainAccess?: (browser: ChromiumBrowser) => void;
  } = {},
): Promise<ExtractResult> => {
  const warnings: string[] = [];
  const databasePath = resolveCookieDbPath(browser);

  if (!databasePath) {
    warnings.push(`${browser}: cookie database not found`);
    return { cookies: [], warnings };
  }

  let tempDir: string;
  let tempDatabasePath: string;
  try {
    ({ tempDir, tempDatabasePath } = copyDatabaseToTemp(
      databasePath,
      `cookies-${browser}-`,
      "Cookies",
    ));
  } catch (error) {
    warnings.push(formatWarning(browser, "failed to copy cookie database", error));
    return { cookies: [], warnings };
  }

  try {
    const whereClause = buildHostWhereClause(hosts, "host_key");
    const metaVersion = await readMetaVersion(tempDatabasePath);
    const stripHashPrefix = metaVersion >= CHROMIUM_META_VERSION_HASH_PREFIX;

    const decryptValue = await buildDecryptor(
      browser,
      stripHashPrefix,
      options.timeoutMs,
      warnings,
      options.onKeychainAccess,
    );
    if (!decryptValue) return { cookies: [], warnings };

    const sql =
      `SELECT name, value, host_key, path, expires_utc, samesite, ` +
      `encrypted_value, is_secure, is_httponly ` +
      `FROM cookies WHERE (${whereClause}) ORDER BY expires_utc DESC`;

    const cookieRows = await querySqlite(tempDatabasePath, sql);
    const allowlist = options.names ? new Set(options.names) : null;
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
          cookieRow.encrypted_value instanceof Uint8Array ? cookieRow.encrypted_value : null;
        if (!encrypted) continue;
        cookieValue = decryptValue(encrypted);
      }
      if (cookieValue === null) continue;

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

    return { cookies, warnings };
  } catch (error) {
    warnings.push(formatWarning(browser, "failed to read cookies", error));
    return { cookies: [], warnings };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const buildDecryptor = async (
  browser: ChromiumBrowser,
  stripHashPrefix: boolean,
  timeoutMs: number | undefined,
  warnings: string[],
  onKeychainAccess?: (browser: ChromiumBrowser) => void | Promise<void>,
): Promise<((encrypted: Uint8Array) => string | null) | null> => {
  const currentPlatform = platform();

  if (currentPlatform === "darwin") {
    await onKeychainAccess?.(browser);
    const password = getKeychainPassword(browser, timeoutMs);
    if (!password) {
      warnings.push(`${browser}: keychain password not found`);
      return null;
    }
    const key = deriveKey(password, PBKDF2_ITERATIONS_DARWIN);
    return (encrypted) => decryptAes128Cbc(encrypted, [key], stripHashPrefix);
  }

  if (currentPlatform === "linux") {
    await onKeychainAccess?.(browser);
    const password = getLinuxPassword(browser, timeoutMs);
    const keys = new Set<string>([password, "peanuts", ""]);
    const candidates = Array.from(keys).map((key) => deriveKey(key, PBKDF2_ITERATIONS_LINUX));
    return (encrypted) => decryptAes128Cbc(encrypted, candidates, stripHashPrefix);
  }

  if (currentPlatform === "win32") {
    await onKeychainAccess?.(browser);
    const masterKey = getWindowsMasterKey(browser, timeoutMs);
    if (!masterKey) {
      warnings.push(`${browser}: DPAPI master key not found`);
      return null;
    }
    return (encrypted) => decryptAes256Gcm(encrypted, masterKey, stripHashPrefix);
  }

  warnings.push(`${browser}: unsupported platform ${currentPlatform}`);
  return null;
};
