import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { act } from "../src/act";
import { snapshot } from "../src/snapshot";

describe("act", () => {
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

  it("should perform a click action and return updated snapshot", async () => {
    await page.setContent(`
      <html><body>
        <button onclick="this.textContent='Clicked!'">Click Me</button>
      </body></html>
    `);

    const before = await snapshot(page);
    const buttonRef = Object.keys(before.refs).find((key) => before.refs[key].name === "Click Me");
    expect(buttonRef).toBeDefined();

    const after = await act(page, buttonRef!, (locator) => locator.click());
    expect(after.tree).toContain("Clicked!");
  });

  it("should perform a fill action and return updated snapshot", async () => {
    await page.setContent(`
      <html><body>
        <label for="name">Name</label>
        <input id="name" type="text" />
      </body></html>
    `);

    const before = await snapshot(page);
    const inputRef = Object.keys(before.refs).find((key) => before.refs[key].role === "textbox");
    expect(inputRef).toBeDefined();

    const after = await act(page, inputRef!, (locator) => locator.fill("Alice"));
    expect(after.tree).toContain("Alice");
  });

  it("should toggle a checkbox via act", async () => {
    await page.setContent(`
      <html><body>
        <input type="checkbox" aria-label="Accept terms" />
      </body></html>
    `);

    const before = await snapshot(page);
    const checkboxRef = Object.keys(before.refs).find(
      (key) => before.refs[key].role === "checkbox",
    );
    expect(checkboxRef).toBeDefined();

    await act(page, checkboxRef!, (locator) => locator.check());
    const isChecked = await page.locator('[aria-label="Accept terms"]').isChecked();
    expect(isChecked).toBe(true);
  });

  it("should return a snapshot with valid refs after action", async () => {
    await page.setContent(`
      <html><body>
        <button onclick="document.body.innerHTML='<a href=\\'/new\\'>New Link</a>'">Replace</button>
      </body></html>
    `);

    const before = await snapshot(page);
    const buttonRef = Object.keys(before.refs).find((key) => before.refs[key].role === "button");
    expect(buttonRef).toBeDefined();

    const after = await act(page, buttonRef!, (locator) => locator.click());
    expect(after.tree).toContain("link");
    expect(after.tree).toContain("New Link");

    const linkRef = Object.keys(after.refs).find((key) => after.refs[key].role === "link");
    expect(linkRef).toBeDefined();

    const locator = after.locator(linkRef!);
    expect(await locator.textContent()).toBe("New Link");
  });

  it("should forward snapshot options", async () => {
    await page.setContent(`
      <html><body>
        <h1>Title</h1>
        <button onclick="this.textContent='Done'">Action</button>
      </body></html>
    `);

    const interactiveBefore = await snapshot(page, { interactive: true });
    const buttonRef = Object.keys(interactiveBefore.refs).find(
      (key) => interactiveBefore.refs[key].role === "button",
    );
    expect(buttonRef).toBeDefined();

    const after = await act(page, buttonRef!, (locator) => locator.click(), { interactive: true });

    const roles = Object.values(after.refs).map((entry) => entry.role);
    expect(roles).not.toContain("heading");
    expect(roles).toContain("button");
  });

  it("should handle actions on duplicate-named elements", async () => {
    await page.setContent(`
      <html><body>
        <button onclick="document.title='first'">Go</button>
        <button onclick="document.title='second'">Go</button>
      </body></html>
    `);

    const before = await snapshot(page);
    const goButtons = Object.entries(before.refs).filter(
      ([, entry]) => entry.role === "button" && entry.name === "Go",
    );
    expect(goButtons.length).toBe(2);

    await act(page, goButtons[1][0], (locator) => locator.click());
    expect(await page.title()).toBe("second");
  });

  it("should handle select option action", async () => {
    await page.setContent(`
      <html><body>
        <label for="fruit">Fruit</label>
        <select id="fruit">
          <option value="apple">Apple</option>
          <option value="banana">Banana</option>
        </select>
      </body></html>
    `);

    const before = await snapshot(page);
    const selectRef = Object.keys(before.refs).find((key) => before.refs[key].role === "combobox");
    expect(selectRef).toBeDefined();

    await act(page, selectRef!, (locator) => locator.selectOption("banana"));
    const value = await page.locator("#fruit").inputValue();
    expect(value).toBe("banana");
  });
});
