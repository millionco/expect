import {
  browserDisplayNameToKey,
  detectBrowserProfiles,
  detectDefaultBrowser,
  extractAllProfileCookies,
  extractCookies,
} from "@browser-tester/cookies";
import type { Browser as BrowserKey, Cookie } from "@browser-tester/cookies";
import { chromium } from "playwright";
import { HEADLESS_CHROMIUM_ARGS } from "./constants";
import { injectCookies } from "./inject-cookies";
import type { CreatePageOptions, CreatePageResult } from "./types";

const extractDefaultBrowserCookies = async (
  url: string,
  defaultBrowser: BrowserKey | null,
): Promise<Cookie[]> => {
  if (defaultBrowser) {
    const profiles = detectBrowserProfiles().filter(
      (profile) => browserDisplayNameToKey(profile.browser.name) === defaultBrowser,
    );

    if (profiles.length > 0) {
      const result = await extractAllProfileCookies(profiles);
      if (result.cookies.length > 0) return result.cookies;
    }
  }

  const browsers = defaultBrowser ? [defaultBrowser] : undefined;
  const result = await extractCookies({ url, browsers });
  return result.cookies;
};

export const createPage = async (
  url: string,
  options: CreatePageOptions = {},
): Promise<CreatePageResult> => {
  const browser = await chromium.launch({
    headless: !options.headed,
    executablePath: options.executablePath,
    args: HEADLESS_CHROMIUM_ARGS,
  });

  try {
    const context = await browser.newContext();

    if (options.cookies) {
      const cookies = Array.isArray(options.cookies)
        ? options.cookies
        : await extractDefaultBrowserCookies(url, await detectDefaultBrowser());
      await injectCookies(context, cookies);
    }

    const page = await context.newPage();
    await page.goto(url, { waitUntil: options.waitUntil ?? "load" });

    return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
};
