import { runBrowser } from "@browser-tester/browser";
import type { Page } from "playwright";
import { handleError } from "./handle-error";
import { logger } from "./logger";
import type { SharedOptions } from "./shared-options";

export const withPage = async (
  url: string,
  options: SharedOptions,
  action: (page: Page) => Promise<void>,
) => {
  const { browser, page } = await runBrowser((browserService) =>
    browserService.createPage(url, {
      headed: options.headed,
      executablePath: options.executablePath,
      cookies: options.cookies,
      waitUntil: options.waitUntil,
      video: Boolean(options.video),
    }),
  );
  try {
    await action(page);

    if (options.video) {
      const videoPath = await runBrowser((browserService) =>
        browserService.saveVideo(page, options.video!),
      );
      if (videoPath) {
        logger.success(`Video saved to ${videoPath}`);
      }
    }
  } catch (error) {
    handleError(error);
  }
  await browser.close();
};
