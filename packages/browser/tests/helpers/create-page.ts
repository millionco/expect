import { chromium } from "playwright";
import type { Cookie } from "@browser-tester/cookies";
import { HEADLESS_CHROMIUM_ARGS } from "../../src/constants";
import { injectCookies } from "./inject-cookies";

interface CreatePageStandaloneOptions {
  cookies?: Cookie[];
}

export const createPage = async (url: string, options: CreatePageStandaloneOptions = {}) => {
  const browser = await chromium.launch({
    headless: true,
    args: HEADLESS_CHROMIUM_ARGS,
  });
  const context = await browser.newContext();
  if (options.cookies) {
    await injectCookies(context, options.cookies);
  }
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  return { browser, context, page };
};
