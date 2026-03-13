import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { resolveLocator } from "../src/utils/resolve-locator";
import { createLocator } from "../src/utils/create-locator";
import type { RefMap } from "../src/types";

describe("resolveLocator", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("should resolve a locator by role and name", async () => {
    await page.setContent(`
      <html><body>
        <button>Submit</button>
      </body></html>
    `);

    const locator = resolveLocator(page, { role: "button", name: "Submit" });
    expect(await locator.count()).toBe(1);
    expect(await locator.textContent()).toBe("Submit");
  });

  it("should resolve the correct locator when nth is specified", async () => {
    await page.setContent(`
      <html><body>
        <button>OK</button>
        <button>OK</button>
      </body></html>
    `);

    const first = resolveLocator(page, { role: "button", name: "OK", nth: 0 });
    const second = resolveLocator(page, { role: "button", name: "OK", nth: 1 });

    expect(await first.count()).toBe(1);
    expect(await second.count()).toBe(1);
  });

  it("should not apply nth when it is undefined", async () => {
    await page.setContent(`
      <html><body>
        <button>Only</button>
      </body></html>
    `);

    const locator = resolveLocator(page, { role: "button", name: "Only" });
    expect(await locator.count()).toBe(1);
  });

  it("should match exact name", async () => {
    await page.setContent(`
      <html><body>
        <button>Submit Form</button>
        <button>Submit</button>
      </body></html>
    `);

    const locator = resolveLocator(page, { role: "button", name: "Submit" });
    expect(await locator.count()).toBe(1);
    expect(await locator.textContent()).toBe("Submit");
  });

  it("should resolve elements with empty name", async () => {
    await page.setContent(`
      <html><body>
        <button></button>
      </body></html>
    `);

    const locator = resolveLocator(page, { role: "button", name: "" });
    expect(await locator.count()).toBe(1);
  });

  it("should resolve different role types", async () => {
    await page.setContent(`
      <html><body>
        <a href="/home">Home</a>
        <input type="checkbox" aria-label="Agree" />
        <h1>Title</h1>
      </body></html>
    `);

    const link = resolveLocator(page, { role: "link", name: "Home" });
    const checkbox = resolveLocator(page, { role: "checkbox", name: "Agree" });
    const heading = resolveLocator(page, { role: "heading", name: "Title" });

    expect(await link.count()).toBe(1);
    expect(await checkbox.count()).toBe(1);
    expect(await heading.count()).toBe(1);
  });
});

describe("createLocator", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("should return a function that resolves refs", async () => {
    await page.setContent(`
      <html><body>
        <button>Click</button>
      </body></html>
    `);

    const refs: RefMap = {
      e1: { role: "button", name: "Click" },
    };
    const locator = createLocator(page, refs);
    const resolved = locator("e1");
    expect(await resolved.count()).toBe(1);
  });

  it("should throw for unknown ref with available refs listed", () => {
    const refs: RefMap = {
      e1: { role: "button", name: "A" },
      e2: { role: "link", name: "B" },
    };
    const locator = createLocator(page, refs);

    expect(() => locator("e99")).toThrow('Unknown ref "e99"');
    expect(() => locator("e99")).toThrow("available refs: e1, e2");
  });

  it("should throw with empty page hint when no refs exist", () => {
    const refs: RefMap = {};
    const locator = createLocator(page, refs);

    expect(() => locator("e1")).toThrow("no refs available");
    expect(() => locator("e1")).toThrow("page may be empty");
  });

  it("should resolve nth-disambiguated refs correctly", async () => {
    await page.setContent(`
      <html><body>
        <button onclick="document.title='first'">OK</button>
        <button onclick="document.title='second'">OK</button>
      </body></html>
    `);

    const refs: RefMap = {
      e1: { role: "button", name: "OK", nth: 0 },
      e2: { role: "button", name: "OK", nth: 1 },
    };
    const locator = createLocator(page, refs);

    await locator("e2").click();
    expect(await page.title()).toBe("second");

    await locator("e1").click();
    expect(await page.title()).toBe("first");
  });
});
