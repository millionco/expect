import { runBrowser } from "@browser-tester/browser";
import { Command } from "commander";
import { formatOutput } from "../utils/format-output";
import { normalizeUrl } from "../utils/normalize-url";
import { addSharedOptions } from "../utils/shared-options";
import { withPage } from "../utils/with-page";

export const snapshot = addSharedOptions(
  new Command()
    .command("snapshot")
    .description("take an ARIA snapshot of a URL")
    .argument("<url>", "URL to snapshot")
    .option("-i, --interactive", "only include interactive elements")
    .option("-c, --compact", "remove empty structural elements")
    .option("-d, --max-depth <n>", "limit tree depth", parseInt)
    .option("-s, --selector <css>", "scope to CSS selector")
    .option("--cursor", "include cursor-interactive elements"),
).action(async (url: string, options) => {
  await withPage(normalizeUrl(url), options, async (page) => {
    const result = await runBrowser((browser) =>
      browser.snapshot(page, {
        timeout: options.timeout,
        interactive: options.interactive,
        compact: options.compact,
        maxDepth: options.maxDepth,
        selector: options.selector,
        cursor: options.cursor,
      }),
    );

    formatOutput({ tree: result.tree, refs: result.refs, stats: result.stats }, options);
  });
});
