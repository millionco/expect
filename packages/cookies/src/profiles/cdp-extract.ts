import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  BrowserProfile,
  CdpRawCookie,
  Cookie,
  ExtractProfileOptions,
  ExtractResult,
} from "../types.js";
import { copyDir, formatError, sleep } from "@browser-tester/utils";
import { browserDisplayNameToKey } from "../utils/browser-name-map.js";
import { normalizeSameSite } from "../utils/normalize-same-site.js";
import { getCookiesFromBrowser } from "./cdp-client.js";
import {
  BROWSER_KILL_DELAY_MS,
  BROWSER_STARTUP_DELAY_MS,
  CDP_LOCAL_PORT,
  HEADLESS_CHROME_ARGS,
  TEMP_DIR_CLEANUP_RETRIES,
  TEMP_DIR_RETRY_DELAY_MS,
} from "./constants.js";

const startHeadlessBrowser = (
  executablePath: string,
  userDataDir: string,
  port: number,
): ChildProcess => {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...HEADLESS_CHROME_ARGS,
  ];

  const childProcess = spawn(executablePath, args, {
    stdio: "ignore",
    detached: true,
  });

  childProcess.unref();
  return childProcess;
};

const SINGLETON_LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

const removeSingletonLocks = (profileDir: string): void => {
  for (const lockFile of SINGLETON_LOCK_FILES) {
    const lockPath = path.join(profileDir, lockFile);
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  }
};

const toProfileCookie = (rawCookie: CdpRawCookie, profile: BrowserProfile): Cookie => ({
  name: rawCookie.name,
  value: rawCookie.value,
  domain: rawCookie.domain,
  path: rawCookie.path,
  expires: rawCookie.expires > 0 ? rawCookie.expires : undefined,
  secure: rawCookie.secure,
  httpOnly: rawCookie.httpOnly,
  sameSite: normalizeSameSite(rawCookie.sameSite),
  browser: browserDisplayNameToKey(profile.browser.name) ?? "chrome",
});

export const extractChromiumProfileCookies = async (
  options: ExtractProfileOptions,
): Promise<ExtractResult> => {
  const { profile } = options;
  const port = options.port ?? CDP_LOCAL_PORT;
  const warnings: string[] = [];

  const tempDir = mkdtempSync(path.join(tmpdir(), "cookies-cdp-"));
  let browser: ChildProcess | null = null;

  try {
    const profileCopyPath = path.join(tempDir, "profile");
    copyDir(profile.profilePath, profileCopyPath);
    removeSingletonLocks(profileCopyPath);

    browser = startHeadlessBrowser(profile.browser.executablePath, profileCopyPath, port);
    await sleep(BROWSER_STARTUP_DELAY_MS);

    const rawCookies = await getCookiesFromBrowser(port);

    if (rawCookies.length === 0) {
      warnings.push(`no cookies found in profile: ${profile.displayName}`);
      return { cookies: [], warnings };
    }

    return {
      cookies: rawCookies.map((rawCookie) => toProfileCookie(rawCookie, profile)),
      warnings,
    };
  } catch (error) {
    warnings.push(`failed to extract cookies from ${profile.displayName}: ${formatError(error)}`);
    return { cookies: [], warnings };
  } finally {
    if (browser) {
      try {
        browser.kill();
      } catch {
        // HACK: process may have already exited
      }
      await sleep(BROWSER_KILL_DELAY_MS);
    }

    try {
      rmSync(tempDir, {
        recursive: true,
        force: true,
        maxRetries: TEMP_DIR_CLEANUP_RETRIES,
        retryDelay: TEMP_DIR_RETRY_DELAY_MS,
      });
    } catch {
      // HACK: temp dir cleanup failure is non-fatal
    }
  }
};
