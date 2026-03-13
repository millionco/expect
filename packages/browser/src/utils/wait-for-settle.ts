import type { Page } from "playwright";
import { NAVIGATION_DETECT_DELAY_MS, POST_NAVIGATION_SETTLE_MS } from "../constants";

export const waitForNavigationSettle = async (page: Page, urlBefore: string): Promise<void> => {
  await page.waitForTimeout(NAVIGATION_DETECT_DELAY_MS);
  if (page.url() !== urlBefore) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(POST_NAVIGATION_SETTLE_MS);
  }
};
