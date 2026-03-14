import {
  detectBrowserProfiles,
  detectDefaultBrowser,
  extractAllProfileCookies,
  extractCookies,
} from "@browser-tester/cookies";
import { tmpdir } from "node:os";
import type { Browser as BrowserKey, Cookie } from "@browser-tester/cookies";
import { chromium } from "playwright";
import { HEADLESS_CHROMIUM_ARGS } from "./constants";
import { injectCookies } from "./inject-cookies";
import type { CreatePageOptions, CreatePageResult, VideoOptions } from "./types";

const extractDefaultBrowserCookies = async (
  url: string,
  defaultBrowser: BrowserKey | null,
): Promise<Cookie[]> => {
  if (defaultBrowser) {
    const profiles = detectBrowserProfiles({ browser: defaultBrowser });

    if (profiles.length > 0) {
      const result = await extractAllProfileCookies(profiles);
      if (result.cookies.length > 0) return result.cookies;
    }
  }

  const browsers = defaultBrowser ? [defaultBrowser] : undefined;
  const result = await extractCookies({ url, browsers });
  return result.cookies;
};

const resolveVideoOptions = (
  video: boolean | VideoOptions | undefined,
): VideoOptions | undefined => {
  if (!video) return undefined;
  if (video === true) return { dir: tmpdir() };
  return video;
};

const navigatePage = async (
  page: CreatePageResult["page"],
  url: string | undefined,
  waitUntil: CreatePageOptions["waitUntil"],
) => {
  if (!url) return;
  await page.goto(url, { waitUntil: waitUntil ?? "load" });
};

export const createPage = async (
  url: string | undefined,
  options: CreatePageOptions = {},
): Promise<CreatePageResult> => {
  const browser = await chromium.launch({
    headless: !options.headed,
    executablePath: options.executablePath,
    args: HEADLESS_CHROMIUM_ARGS,
  });

  try {
    const recordVideo = resolveVideoOptions(options.video);
    const context = await browser.newContext(recordVideo ? { recordVideo } : undefined);

    if (options.cookies) {
      const cookies = Array.isArray(options.cookies)
        ? options.cookies
        : await extractDefaultBrowserCookies(url ?? "", await detectDefaultBrowser());
      await injectCookies(context, cookies);
    }

    const page = await context.newPage();
    await navigatePage(page, url, options.waitUntil);

    return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
};
