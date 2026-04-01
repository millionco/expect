import { Effect } from "effect";
import { describe, it, expect, beforeAll, afterAll } from "vite-plus/test";
import { chromium } from "playwright";
import type { Browser as PlaywrightBrowser, Page } from "playwright";
import { Browser } from "../src/browser";
import { RUNTIME_SCRIPT } from "../src/generated/runtime-script";

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

const snapshotPage = (page: Page, options = {}) =>
  Effect.gen(function* () {
    const browser = yield* Browser;
    return yield* browser.snapshot(page, options);
  }).pipe(Effect.provide(Browser.layer));

const generateItems = (count: number) =>
  Array.from({ length: count }, (_, index) => `<button>Item ${index + 1}</button>`).join("\n");

const SCROLLABLE_PAGE = `<!DOCTYPE html>
<html><body>
  <h1>Page Title</h1>
  <div style="height: 100px; overflow-y: auto; display: flex; flex-direction: column;" aria-label="Item List">
    ${generateItems(30)}
  </div>
</body></html>`;

describe("viewport-aware snapshot", () => {
  let playwrightBrowser: PlaywrightBrowser;
  let page: Page;

  beforeAll(async () => {
    playwrightBrowser = await chromium.launch({ headless: true });
    const context = await playwrightBrowser.newContext();
    await context.addInitScript(RUNTIME_SCRIPT);
    page = await context.newPage();
  });

  afterAll(async () => {
    await playwrightBrowser.close();
  });

  describe("scroll container filtering", () => {
    it("should hide off-viewport items in scrollable containers", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: true }));

      const itemLines = result.tree.split("\n").filter((line) => line.includes("Item "));
      expect(itemLines.length).toBeLessThan(30);
    });

    it("should include hidden-content marker notes", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: true }));

      const hasHiddenBelow = result.tree.includes("items hidden below");
      expect(hasHiddenBelow).toBe(true);
    });

    it("should show all items when viewportAware is false", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: false }));

      const itemLines = result.tree.split("\n").filter((line) => line.includes("Item "));
      expect(itemLines.length).toBe(30);
      expect(result.tree).not.toContain("items hidden");
    });

    it("should populate totalNodes and visibleNodes in stats when filtering applies", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: true }));

      expect(result.stats.totalNodes).toBeDefined();
      expect(result.stats.visibleNodes).toBeDefined();
      expect(result.stats.totalNodes).toBeGreaterThan(result.stats.visibleNodes!);
      expect(result.stats.visibleNodes).toBe(result.stats.lines);
    });

    it("should not set totalNodes/visibleNodes when viewportAware is false", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: false }));

      expect(result.stats.totalNodes).toBeUndefined();
      expect(result.stats.visibleNodes).toBeUndefined();
    });
  });

  describe("non-scrollable pages", () => {
    it("should not alter tree for pages without scrollable containers", async () => {
      await page.setContent(`
        <html><body>
          <h1>Hello</h1>
          <button>Click</button>
        </body></html>
      `);

      const withViewport = await run(snapshotPage(page, { viewportAware: true }));
      const withoutViewport = await run(snapshotPage(page, { viewportAware: false }));

      expect(withViewport.tree).toBe(withoutViewport.tree);
      expect(withViewport.tree).not.toContain("items hidden");
    });

    it("should not set totalNodes/visibleNodes when no filtering occurs", async () => {
      await page.setContent(`
        <html><body>
          <button>A</button>
          <button>B</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { viewportAware: true }));
      expect(result.stats.totalNodes).toBeUndefined();
      expect(result.stats.visibleNodes).toBeUndefined();
    });
  });

  describe("scroll position awareness", () => {
    it("should reflect current scroll position in visible items", async () => {
      await page.setContent(SCROLLABLE_PAGE);

      const beforeScroll = await run(snapshotPage(page, { viewportAware: true }));
      expect(beforeScroll.tree).toContain("Item 1");

      await page.evaluate(() => {
        const scrollContainer = document.querySelector('[aria-label="Item List"]');
        if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });

      const afterScroll = await run(snapshotPage(page, { viewportAware: true }));
      expect(afterScroll.tree).toContain("Item 30");
      expect(afterScroll.tree).toContain("items hidden above");
    });
  });

  describe("DOM restoration", () => {
    it("should not leave aria-hidden attributes on elements after snapshot", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      await run(snapshotPage(page, { viewportAware: true }));

      const hiddenCount = await page.evaluate(
        () => document.querySelectorAll("[data-expect-scroll-hidden]").length,
      );
      expect(hiddenCount).toBe(0);
    });

    it("should not leave marker elements in the DOM after snapshot", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      await run(snapshotPage(page, { viewportAware: true }));

      const markerCount = await page.evaluate(
        () => document.querySelectorAll("[data-expect-scroll-marker]").length,
      );
      expect(markerCount).toBe(0);
    });

    it("should preserve pre-existing aria-hidden attributes", async () => {
      await page.setContent(`
        <html><body>
          <div style="height: 100px; overflow-y: auto; display: flex; flex-direction: column;" aria-label="List">
            <button aria-hidden="true">Decorative 1</button>
            <button>Item 1</button>
            <button>Item 2</button>
            <button>Item 3</button>
            <button>Item 4</button>
            <button>Item 5</button>
            <button>Item 6</button>
            <button>Item 7</button>
            <button>Item 8</button>
            <button>Item 9</button>
            <button>Item 10</button>
          </div>
        </body></html>
      `);

      await run(snapshotPage(page, { viewportAware: true }));

      const decorativeHidden = await page.evaluate(
        () => document.querySelector('button[aria-hidden="true"]')?.textContent,
      );
      expect(decorativeHidden).toBe("Decorative 1");
    });

    it("should restore DOM even when ariaSnapshot fails", async () => {
      await page.setContent(SCROLLABLE_PAGE);

      await run(
        snapshotPage(page, { viewportAware: true, selector: "nonexistent", timeout: 100 }),
      ).catch(() => {});

      const hiddenCount = await page.evaluate(
        () => document.querySelectorAll("[data-expect-scroll-hidden]").length,
      );
      const markerCount = await page.evaluate(
        () => document.querySelectorAll("[data-expect-scroll-marker]").length,
      );
      expect(hiddenCount).toBe(0);
      expect(markerCount).toBe(0);
    });
  });

  describe("small scroll containers", () => {
    it("should not filter containers with fewer than 5 children", async () => {
      await page.setContent(`
        <html><body>
          <div style="height: 50px; overflow-y: auto; display: flex; flex-direction: column;">
            <button>A</button>
            <button>B</button>
            <button>C</button>
          </div>
        </body></html>
      `);

      const withViewport = await run(snapshotPage(page, { viewportAware: true }));
      const withoutViewport = await run(snapshotPage(page, { viewportAware: false }));

      expect(withViewport.tree).toBe(withoutViewport.tree);
    });
  });

  describe("nested scroll containers", () => {
    it("should filter both inner and outer scroll containers independently", async () => {
      const innerItems = Array.from(
        { length: 15 },
        (_, index) => `<button>Inner ${index + 1}</button>`,
      ).join("\n");
      const outerItems = Array.from(
        { length: 10 },
        (_, index) => `<button>Outer ${index + 1}</button>`,
      ).join("\n");

      await page.setContent(`
        <html><body>
          <div style="height: 200px; overflow-y: auto; display: flex; flex-direction: column;" aria-label="Outer">
            ${outerItems}
            <div style="height: 80px; overflow-y: auto; display: flex; flex-direction: column;" aria-label="Inner">
              ${innerItems}
            </div>
          </div>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { viewportAware: true }));
      const fullResult = await run(snapshotPage(page, { viewportAware: false }));

      const visibleLines = result.tree.split("\n").length;
      const fullLines = fullResult.tree.split("\n").length;
      expect(visibleLines).toBeLessThan(fullLines);
    });
  });

  describe("ref assignment with viewport-aware filtering", () => {
    it("should assign refs only to visible elements", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: true }));

      const refCount = Object.keys(result.refs).length;
      expect(refCount).toBeLessThan(31);
      expect(refCount).toBeGreaterThan(0);
    });

    it("should resolve refs to correct visible elements", async () => {
      await page.setContent(SCROLLABLE_PAGE);
      const result = await run(snapshotPage(page, { viewportAware: true }));

      const firstItemRef = Object.entries(result.refs).find(
        ([, entry]) => entry.role === "button" && entry.name.startsWith("Item"),
      );
      expect(firstItemRef).toBeDefined();

      const locator = await run(result.locator(firstItemRef![0]));
      const text = await locator.textContent();
      expect(text).toContain("Item");
    });
  });
});
