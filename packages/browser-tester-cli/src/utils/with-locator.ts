import { Effect } from "effect";
import { runBrowser, diffSnapshots } from "@browser-tester/browser";
import type { Locator } from "playwright";
import pc from "picocolors";
import { formatOutput } from "./format-output";
import { logger } from "./logger";
import type { SharedOptions } from "./shared-options";
import { withPage } from "./with-page";

export const withLocator = async (
  url: string,
  ref: string,
  options: SharedOptions,
  action: (locator: Locator) => Promise<void>,
) => {
  await withPage(url, options, async (page) => {
    const snapshotOptions = { timeout: options.timeout };
    const before = await runBrowser((browser) => browser.snapshot(page, snapshotOptions));
    const urlBefore = page.url();

    const locator = Effect.runSync(before.locator(ref));
    await action(locator);
    await runBrowser((browser) => browser.waitForNavigationSettle(page, urlBefore));

    const after = await runBrowser((browser) => browser.snapshot(page, snapshotOptions));

    if (options.diff) {
      const result = diffSnapshots(before.tree, after.tree);
      if (!result.changed) {
        logger.dim("No changes detected.");
        return;
      }
      const coloredDiff = result.diff
        .split("\n")
        .map((line) => {
          if (line.startsWith("+ ")) return pc.green(line);
          if (line.startsWith("- ")) return pc.red(line);
          return pc.dim(line);
        })
        .join("\n");
      logger.log(coloredDiff);
    } else {
      formatOutput({ tree: after.tree, refs: after.refs, stats: after.stats }, options);
    }
  });
};
