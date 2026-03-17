import path from "node:path";
import { writeFile } from "node:fs/promises";
import { runBrowser } from "@browser-tester/browser";
import { Command } from "commander";
import { logger } from "../utils/logger";
import { normalizeUrl } from "../utils/normalize-url";
import { addSharedOptions } from "../utils/shared-options";
import { withPage } from "../utils/with-page";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

export const screenshot = addSharedOptions(
  new Command()
    .command("screenshot")
    .description("take a screenshot of a URL")
    .argument("<url>", "URL to screenshot")
    .argument("<path>", "file path to save the screenshot")
    .option("--annotate", "overlay numbered labels on interactive elements"),
).action(async (url: string, outputPath: string, options) => {
  const extension = path.extname(outputPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    logger.error(`Unsupported file extension "${extension || "(none)"}". Use .png, .jpg, or .jpeg`);
    process.exit(1);
  }

  await withPage(normalizeUrl(url), options, async (page) => {
    if (options.annotate) {
      const result = await runBrowser((browser) =>
        browser.annotatedScreenshot(page, {
          timeout: options.timeout,
          interactive: options.interactive,
          fullPage: true,
        }),
      );
      await writeFile(outputPath, result.screenshot);
      logger.success(`Annotated screenshot saved to ${outputPath}`);
      for (const annotation of result.annotations) {
        logger.log(
          `  [${annotation.label}] @${annotation.ref} ${annotation.role} "${annotation.name}"`,
        );
      }
    } else {
      await page.screenshot({ path: outputPath, fullPage: true });
      logger.success(`Screenshot saved to ${outputPath}`);
    }
  });
});
