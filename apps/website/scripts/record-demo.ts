import { chromium, type Locator, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { DEMO_STEP_DEFINITIONS, DEMO_TARGET_URL } from "../lib/demo/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_SCRIPT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "browser",
  "src",
  "generated",
  "runtime-script.ts",
);
const RUNTIME_MODULE = fs.readFileSync(RUNTIME_SCRIPT_PATH, "utf-8");
const inlineExportPrefix = "export const RUNTIME_SCRIPT = ";
const multilineExportPrefix = "export const RUNTIME_SCRIPT =\n  ";
const runtimeScriptPrefix = RUNTIME_MODULE.startsWith(inlineExportPrefix)
  ? inlineExportPrefix
  : RUNTIME_MODULE.startsWith(multilineExportPrefix)
    ? multilineExportPrefix
    : undefined;

if (!runtimeScriptPrefix) {
  throw new Error("Failed to parse RUNTIME_SCRIPT from generated file");
}

const RUNTIME_SCRIPT: string = new Function(
  `return ${RUNTIME_MODULE.slice(runtimeScriptPrefix.length)}`,
)();

const MANUAL_FLAG = "--manual";
const OUTPUT_PATH = path.join(__dirname, "..", "lib", "recorded-demo-events.json");
const POLL_INTERVAL_MS = 500;
const DEFAULT_VIEWPORT_WIDTH_PX = 1280;
const DEFAULT_VIEWPORT_HEIGHT_PX = 720;
const INITIAL_LOAD_SETTLE_MS = 800;
const HOVER_SETTLE_MS = 200;
const CLICK_SETTLE_MS = 300;
const NAVIGATE_SETTLE_MS = 500;

interface RecordDemoOptions {
  readonly manual: boolean;
  readonly targetUrl: string;
}

const waitForEnter = (prompt: string): Promise<void> => {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    readline.question(prompt, () => {
      readline.close();
      resolve();
    });
  });
};

const parseOptions = (): RecordDemoOptions => {
  const cliArguments = process.argv.slice(2);
  let manual = false;
  let targetUrl = DEMO_TARGET_URL;

  for (const argument of cliArguments) {
    if (argument === MANUAL_FLAG) {
      manual = true;
      continue;
    }

    targetUrl = argument;
  }

  return { manual, targetUrl };
};

const isInvoiceAppTarget = (targetUrl: string): boolean => {
  try {
    const url = new URL(targetUrl);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const waitUntilOffset = async (
  page: Page,
  scenarioStartMs: number,
  offsetMs: number,
): Promise<void> => {
  const remainingMs = scenarioStartMs + offsetMs - Date.now();
  if (remainingMs > 0) {
    await page.waitForTimeout(remainingMs);
  }
};

const hoverAndClick = async (page: Page, locator: Locator): Promise<void> => {
  await locator.waitFor({ state: "visible" });
  await locator.hover();
  await page.waitForTimeout(HOVER_SETTLE_MS);
  await locator.click();
  await page.waitForTimeout(CLICK_SETTLE_MS);
};

const recordInvoiceAppScenario = async (page: Page): Promise<void> => {
  const [setupStep, formStep, , , deleteStep, resultsStep] = DEMO_STEP_DEFINITIONS;
  const scenarioStartMs = Date.now();

  await page.waitForTimeout(INITIAL_LOAD_SETTLE_MS);
  await page.mouse.move(640, 300, { steps: 10 });
  await page.waitForTimeout(400);
  await page.mouse.move(500, 400, { steps: 8 });
  await waitUntilOffset(page, scenarioStartMs, setupStep.endOffsetMs);

  const newInvoiceButton = page.locator("a", { hasText: "New Invoice" });
  await hoverAndClick(page, newInvoiceButton);
  await page.waitForTimeout(NAVIGATE_SETTLE_MS);

  const createButton = page.locator("button[type='submit']", { hasText: "Create Invoice" });
  await page.mouse.move(400, 500, { steps: 8 });
  await hoverAndClick(page, createButton);
  await page.waitForTimeout(NAVIGATE_SETTLE_MS);
  await waitUntilOffset(page, scenarioStartMs, formStep.endOffsetMs);

  await page.mouse.move(640, 350, { steps: 8 });
  await page.waitForTimeout(300);

  const deleteButtons = page.locator("button:has(svg)").filter({ hasNot: page.locator("a") });
  const firstDelete = deleteButtons.first();
  await hoverAndClick(page, firstDelete);
  await waitUntilOffset(page, scenarioStartMs, deleteStep.endOffsetMs);

  await page.mouse.move(640, 400, { steps: 10 });
  await waitUntilOffset(page, scenarioStartMs, resultsStep.endOffsetMs);
};

const run = async () => {
  const { manual, targetUrl } = parseOptions();
  const useScriptedScenario = !manual && isInvoiceAppTarget(targetUrl);

  console.log(`Recording rrweb events from: ${targetUrl}`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log(`Mode: ${useScriptedScenario ? "scripted InvoiceApp" : "manual"}\n`);

  const browser = await chromium.launch({ headless: useScriptedScenario });
  const context = await browser.newContext({
    viewport: { width: DEFAULT_VIEWPORT_WIDTH_PX, height: DEFAULT_VIEWPORT_HEIGHT_PX },
  });

  await context.addInitScript(RUNTIME_SCRIPT);

  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "load" });

  await page.evaluate(() => {
    const runtime = Reflect.get(globalThis, "__EXPECT_RUNTIME__");
    if (runtime?.startRecording) runtime.startRecording();
  });

  const allEvents: unknown[] = [];
  const pollTimer = setInterval(async () => {
    try {
      const events = await page.evaluate(() => {
        const runtime = Reflect.get(globalThis, "__EXPECT_RUNTIME__");
        return runtime?.getEvents?.() ?? [];
      });

      if (Array.isArray(events) && events.length > 0) {
        allEvents.push(...events);
        process.stdout.write(`\r  Collected ${allEvents.length} events so far...`);
      }
    } catch {
      return;
    }
  }, POLL_INTERVAL_MS);

  try {
    if (useScriptedScenario) {
      console.log("Running scripted InvoiceApp interactions.\n");
      await recordInvoiceAppScenario(page);
    } else {
      console.log("Recording started. Interact with the browser.");
      console.log("Press Enter when done to save the events.\n");
      await waitForEnter("");
    }
  } finally {
    clearInterval(pollTimer);
  }

  try {
    const finalEvents = await page.evaluate(() => {
      const runtime = Reflect.get(globalThis, "__EXPECT_RUNTIME__");
      runtime?.stopRecording?.();
      return runtime?.getAllEvents?.() ?? [];
    });

    if (Array.isArray(finalEvents) && finalEvents.length > 0) {
      allEvents.push(...finalEvents);
    }
  } catch {
    return;
  } finally {
    await browser.close();
  }

  console.log(`\n\nTotal events captured: ${allEvents.length}`);

  if (allEvents.length === 0) {
    console.log("No events recorded. Exiting.");
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allEvents, undefined, 2));
  console.log(`Saved to: ${OUTPUT_PATH}`);
};

run().catch((error) => {
  console.error("Recording failed:", error);
  process.exit(1);
});
