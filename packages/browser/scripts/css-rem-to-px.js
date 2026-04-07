/**
 * Converts all `rem` units in the built Tailwind CSS to `px`.
 *
 * The overlay renders inside a shadow DOM for style isolation, but `rem` is
 * always relative to the document root (`<html>`) font-size — not the shadow
 * host. Pages like YouTube set `html { font-size: 10px }`, which shrinks every
 * rem-based value and breaks the overlay layout.
 *
 * Running this after Tailwind makes all values absolute.
 */
import * as fs from "node:fs";

const BROWSER_DEFAULT_FONT_SIZE_PX = 16;
const CSS_OUTPUT_PATH = "./dist/overlay.css";

const cssContent = fs.readFileSync(CSS_OUTPUT_PATH, "utf8");
const transformedCss = cssContent.replace(
  /(\d*\.?\d+)rem\b/g,
  (_, remValue) => `${parseFloat(remValue) * BROWSER_DEFAULT_FONT_SIZE_PX}px`,
);
fs.writeFileSync(CSS_OUTPUT_PATH, transformedCss);
