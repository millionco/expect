import {
  snapshot as takeSnapshot,
  diffSnapshots,
  waitForNavigationSettle,
} from "@browser-tester/browser";
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
    const before = await takeSnapshot(page, snapshotOptions);
    const urlBefore = page.url();

    await action(before.locator(ref));
    await waitForNavigationSettle(page, urlBefore);

    const after = await takeSnapshot(page, snapshotOptions);

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
