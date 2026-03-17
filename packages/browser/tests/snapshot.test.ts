import { Effect } from "effect";
import { describe, it, expect, beforeAll, afterAll } from "vite-plus/test";
import { chromium } from "playwright";
import type { Browser as PlaywrightBrowser, Page } from "playwright";
import { Browser } from "../src/browser";

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);

const snapshotPage = (page: Page, options = {}) =>
  Effect.gen(function* () {
    const browser = yield* Browser;
    return yield* browser.snapshot(page, options);
  }).pipe(Effect.provide(Browser.layer));

describe("snapshot", () => {
  let playwrightBrowser: PlaywrightBrowser;
  let page: Page;

  beforeAll(async () => {
    playwrightBrowser = await chromium.launch({ headless: true });
    const context = await playwrightBrowser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await playwrightBrowser.close();
  });

  describe("tree and refs", () => {
    it("should return a tree with refs", async () => {
      await page.setContent(`
        <html><body>
          <h1>Hello World</h1>
          <a href="/about">About</a>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      expect(result.tree).toContain("heading");
      expect(result.tree).toContain("Hello World");
      expect(result.tree).toContain("[ref=e1]");
      expect(typeof result.refs).toBe("object");
      expect(Object.keys(result.refs).length).toBeGreaterThan(0);
    });

    it("should assign sequential ref ids", async () => {
      await page.setContent(`
        <html><body>
          <button>First</button>
          <button>Second</button>
          <button>Third</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      expect(result.refs.e1).toBeDefined();
      expect(result.refs.e2).toBeDefined();
      expect(result.refs.e3).toBeDefined();
    });

    it("should store role and name in refs", async () => {
      await page.setContent(`
        <html><body>
          <button>Submit</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const buttonRef = Object.values(result.refs).find((entry) => entry.name === "Submit");
      expect(buttonRef).toBeDefined();
      expect(buttonRef?.role).toBe("button");
    });

    it("should handle empty name", async () => {
      await page.setContent(`
        <html><body>
          <button></button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const buttonRef = Object.values(result.refs).find((entry) => entry.role === "button");
      expect(buttonRef).toBeDefined();
      expect(buttonRef?.name).toBe("");
    });
  });

  describe("nth disambiguation", () => {
    it("should set nth on duplicate role+name entries", async () => {
      await page.setContent(`
        <html><body>
          <button>OK</button>
          <button>OK</button>
          <button>Cancel</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const okButtons = Object.values(result.refs).filter(
        (entry) => entry.role === "button" && entry.name === "OK",
      );
      expect(okButtons.length).toBe(2);
      expect(okButtons[0].nth).toBe(0);
      expect(okButtons[1].nth).toBe(1);
    });

    it("should not set nth on unique role+name entries", async () => {
      await page.setContent(`
        <html><body>
          <button>OK</button>
          <button>Cancel</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      for (const entry of Object.values(result.refs)) {
        expect(entry.nth).toBeUndefined();
      }
    });
  });

  describe("locator", () => {
    it("should resolve ref to a working locator", async () => {
      await page.setContent(`
        <html><body>
          <h1>Title</h1>
          <button>Click Me</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const buttonRefKey = Object.keys(result.refs).find(
        (key) => result.refs[key].name === "Click Me",
      );
      expect(buttonRefKey).toBeDefined();

      const locator = await run(result.locator(buttonRefKey!));
      const text = await locator.textContent();
      expect(text).toBe("Click Me");
    });

    it("should fail on unknown ref with available refs", async () => {
      await page.setContent(`
        <html><body>
          <button>OK</button>
        </body></html>
      `);
      const result = await run(snapshotPage(page));
      await expect(run(result.locator("nonexistent"))).rejects.toThrow("available refs: e1");
    });

    it("should fail on unknown ref with empty page hint", async () => {
      await page.setContent("<html><body></body></html>");
      const result = await run(snapshotPage(page));
      await expect(run(result.locator("e1"))).rejects.toThrow("no refs available");
    });

    it("should click the correct element via ref", async () => {
      await page.setContent(`
        <html><body>
          <button onclick="document.title='clicked'">Click Me</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const buttonRefKey = Object.keys(result.refs).find(
        (key) => result.refs[key].name === "Click Me",
      );
      const locator = await run(result.locator(buttonRefKey!));
      await locator.click();
      expect(await page.title()).toBe("clicked");
    });

    it("should click the correct unnamed button among named buttons", async () => {
      await page.setContent(`
        <html><body>
          <button>OK</button>
          <button onclick="document.title='unnamed'"></button>
          <button>Cancel</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const unnamedButtons = Object.entries(result.refs).filter(
        ([, entry]) => entry.role === "button" && !entry.name,
      );
      expect(unnamedButtons.length).toBe(1);

      const [refKey] = unnamedButtons[0];
      const locator = await run(result.locator(refKey));
      await locator.click();
      expect(await page.title()).toBe("unnamed");
    });

    it("should click the correct duplicate button via nth", async () => {
      await page.setContent(`
        <html><body>
          <button onclick="document.title='first'">OK</button>
          <button onclick="document.title='second'">OK</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const okButtons = Object.entries(result.refs).filter(
        ([, entry]) => entry.role === "button" && entry.name === "OK",
      );
      expect(okButtons.length).toBe(2);

      const locator = await run(result.locator(okButtons[1][0]));
      await locator.click();
      expect(await page.title()).toBe("second");
    });

    it("should fill an input via ref", async () => {
      await page.setContent(`
        <html><body>
          <label for="email">Email</label>
          <input id="email" type="text" />
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const inputRefKey = Object.keys(result.refs).find(
        (key) => result.refs[key].role === "textbox",
      );
      expect(inputRefKey).toBeDefined();

      const locator = await run(result.locator(inputRefKey!));
      await locator.fill("test@example.com");
      const value = await page.locator("#email").inputValue();
      expect(value).toBe("test@example.com");
    });

    it("should select an option via ref", async () => {
      await page.setContent(`
        <html><body>
          <label for="color">Color</label>
          <select id="color">
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </select>
        </body></html>
      `);

      const result = await run(snapshotPage(page));
      const selectRefKey = Object.keys(result.refs).find(
        (key) => result.refs[key].role === "combobox",
      );
      expect(selectRefKey).toBeDefined();

      const locator = await run(result.locator(selectRefKey!));
      await locator.selectOption("blue");
      const value = await page.locator("#color").inputValue();
      expect(value).toBe("blue");
    });
  });

  describe("timeout", () => {
    it("should accept a custom timeout", async () => {
      await page.setContent("<html><body><p>Hello</p></body></html>");
      const result = await run(snapshotPage(page, { timeout: 5000 }));
      expect(result.tree).toContain("paragraph");
    });
  });

  describe("interactive filter", () => {
    it("should only include interactive elements", async () => {
      await page.setContent(`
        <html><body>
          <h1>Title</h1>
          <p>Description</p>
          <button>Submit</button>
          <a href="/link">Link</a>
          <input type="text" placeholder="Name" />
        </body></html>
      `);

      const result = await run(snapshotPage(page, { interactive: true }));
      const roles = Object.values(result.refs).map((entry) => entry.role);
      expect(roles).toContain("button");
      expect(roles).toContain("link");
      expect(roles).toContain("textbox");
      expect(roles).not.toContain("heading");
      expect(roles).not.toContain("paragraph");
    });

    it("should return no interactive elements message for static page", async () => {
      await page.setContent(`
        <html><body>
          <h1>Title</h1>
          <p>Just text</p>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { interactive: true }));
      expect(result.tree).toBe("(no interactive elements)");
      expect(Object.keys(result.refs).length).toBe(0);
    });

    it("should exclude non-interactive tree lines", async () => {
      await page.setContent(`
        <html><body>
          <h1>Title</h1>
          <button>OK</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { interactive: true }));
      expect(result.tree).not.toContain("heading");
      expect(result.tree).toContain("button");
    });
  });

  describe("compact filter", () => {
    it("should remove empty structural nodes without refs", async () => {
      await page.setContent(`
        <html><body>
          <div>
            <div>
              <button>Deep</button>
            </div>
          </div>
        </body></html>
      `);

      const full = await run(snapshotPage(page));
      const compacted = await run(snapshotPage(page, { compact: true }));
      expect(compacted.tree.split("\n").length).toBeLessThanOrEqual(full.tree.split("\n").length);
      expect(compacted.tree).toContain("button");
      expect(compacted.tree).toContain("[ref=");
    });

    it("should keep structural parents of ref-bearing children", async () => {
      await page.setContent(`
        <html><body>
          <nav>
            <a href="/home">Home</a>
            <a href="/about">About</a>
          </nav>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { compact: true }));
      expect(result.tree).toContain("navigation");
      expect(result.tree).toContain("link");
    });
  });

  describe("maxDepth filter", () => {
    it("should limit tree depth", async () => {
      await page.setContent(`
        <html><body>
          <nav>
            <ul>
              <li><a href="/home">Home</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </nav>
        </body></html>
      `);

      const shallow = await run(snapshotPage(page, { maxDepth: 1 }));
      const deep = await run(snapshotPage(page));
      expect(shallow.tree.split("\n").length).toBeLessThan(deep.tree.split("\n").length);
    });

    it("should return top-level elements only at depth 0", async () => {
      await page.setContent(`
        <html><body>
          <h1>Title</h1>
          <nav>
            <a href="/link">Link</a>
          </nav>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { maxDepth: 0 }));
      for (const line of result.tree.split("\n")) {
        if (line.trim()) {
          expect(line).toMatch(/^- /);
        }
      }
    });
  });

  describe("combined filters", () => {
    it("should apply interactive and compact together", async () => {
      await page.setContent(`
        <html><body>
          <h1>Title</h1>
          <div>
            <div>
              <button>Submit</button>
            </div>
          </div>
          <p>Footer text</p>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { interactive: true, compact: true }));
      expect(result.tree).toContain("button");
      expect(result.tree).not.toContain("heading");
      expect(result.tree).not.toContain("paragraph");
      expect(Object.keys(result.refs).length).toBe(1);
    });

    it("should apply interactive and maxDepth together", async () => {
      await page.setContent(`
        <html><body>
          <nav>
            <ul>
              <li><a href="/home">Home</a></li>
            </ul>
          </nav>
          <button>Top</button>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { interactive: true, maxDepth: 0 }));
      const roles = Object.values(result.refs).map((entry) => entry.role);
      expect(roles).toContain("button");
      expect(roles).not.toContain("link");
    });

    it("should apply compact and maxDepth together", async () => {
      await page.setContent(`
        <html><body>
          <nav aria-label="Main">
            <ul>
              <li><a href="/a">A</a></li>
              <li><a href="/b">B</a></li>
            </ul>
          </nav>
          <div>
            <div>
              <p>Deep text</p>
            </div>
          </div>
        </body></html>
      `);

      const result = await run(snapshotPage(page, { compact: true, maxDepth: 2 }));
      expect(result.tree).toContain("navigation");
    });

    it("should apply all three filters together", async () => {
      await page.setContent(`
        <html><body>
          <header>
            <h1>Title</h1>
            <nav>
              <ul>
                <li><a href="/a">Link A</a></li>
                <li><a href="/b">Link B</a></li>
              </ul>
            </nav>
          </header>
          <main>
            <p>Content</p>
            <div><div><button>Deep Button</button></div></div>
          </main>
        </body></html>
      `);

      const result = await run(
        snapshotPage(page, {
          interactive: true,
          compact: true,
          maxDepth: 1,
        }),
      );
      expect(result.tree).not.toContain("heading");
      expect(result.tree).not.toContain("paragraph");
    });
  });

  describe("diverse interactive roles", () => {
    it("should handle radio buttons", async () => {
      await page.setContent(
        `<html><body><fieldset><legend>Size</legend><label><input type="radio" name="size" value="s" /> Small</label><label><input type="radio" name="size" value="m" /> Medium</label></fieldset></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("radio");
    });

    it("should handle checkboxes", async () => {
      await page.setContent(
        `<html><body><label><input type="checkbox" /> Accept terms</label></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("checkbox");
    });

    it("should handle sliders", async () => {
      await page.setContent(
        `<html><body><label for="vol">Volume</label><input id="vol" type="range" min="0" max="100" /></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("slider");
    });

    it("should handle switch role", async () => {
      await page.setContent(
        `<html><body><button role="switch" aria-checked="false" aria-label="Dark mode">Toggle</button></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("switch");
    });

    it("should handle tab role", async () => {
      await page.setContent(
        `<html><body><div role="tablist"><button role="tab" aria-selected="true">Tab 1</button><button role="tab" aria-selected="false">Tab 2</button></div></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).filter((entry) => entry.role === "tab").length).toBe(2);
    });

    it("should handle searchbox", async () => {
      await page.setContent(
        `<html><body><input type="search" aria-label="Search" /></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("searchbox");
    });

    it("should handle spinbutton", async () => {
      await page.setContent(
        `<html><body><label for="qty">Quantity</label><input id="qty" type="number" /></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("spinbutton");
    });
  });

  describe("edge cases", () => {
    it("should handle a completely empty body", async () => {
      await page.setContent("<html><body></body></html>");
      const result = await run(snapshotPage(page));
      expect(Object.keys(result.refs).length).toBe(0);
    });

    it("should handle elements with special characters in names", async () => {
      await page.setContent(`<html><body><button>Save &amp; Continue</button></body></html>`);
      const result = await run(snapshotPage(page));
      const entry = Object.values(result.refs).find((ref) => ref.role === "button");
      expect(entry).toBeDefined();
      expect(entry?.name).toContain("&");
    });

    it("should handle multiple nested forms", async () => {
      await page.setContent(
        `<html><body><form aria-label="Login"><label for="user">Username</label><input id="user" type="text" /><button type="submit">Login</button></form><form aria-label="Search"><input type="search" aria-label="Query" /><button type="submit">Search</button></form></body></html>`,
      );
      const result = await run(snapshotPage(page));
      expect(Object.values(result.refs).filter((entry) => entry.role === "button").length).toBe(2);
      expect(
        Object.values(result.refs).filter(
          (entry) => entry.role === "textbox" || entry.role === "searchbox",
        ).length,
      ).toBe(2);
    });

    it("should handle aria-label overriding visible text", async () => {
      await page.setContent(
        `<html><body><button aria-label="Close dialog">X</button></body></html>`,
      );
      const result = await run(snapshotPage(page));
      const entry = Object.values(result.refs).find((ref) => ref.role === "button");
      expect(entry?.name).toBe("Close dialog");
    });

    it("should handle large number of elements", async () => {
      const items = Array.from(
        { length: 50 },
        (_, index) => `<button>Button ${index}</button>`,
      ).join("");
      await page.setContent(`<html><body>${items}</body></html>`);
      const result = await run(snapshotPage(page));
      expect(Object.keys(result.refs).length).toBe(50);
      expect(result.refs.e1).toBeDefined();
      expect(result.refs.e50).toBeDefined();
    });

    it("should handle default options when none are provided", async () => {
      await page.setContent(`<html><body><h1>Hello</h1></body></html>`);
      const result = await run(snapshotPage(page));
      expect(result.tree).toBeTruthy();
      expect(result.refs).toBeDefined();
      expect(typeof result.locator).toBe("function");
    });

    it("should exclude text role from refs", async () => {
      await page.setContent(
        `<html><body><p>Some plain text</p><button>Action</button></body></html>`,
      );
      const result = await run(snapshotPage(page));
      expect(Object.values(result.refs).map((entry) => entry.role)).not.toContain("text");
    });

    it("should handle nested interactive elements inside structural containers", async () => {
      await page.setContent(
        `<html><body><nav><ul><li><a href="/1">Link 1</a></li><li><a href="/2">Link 2</a></li><li><a href="/3">Link 3</a></li></ul></nav></body></html>`,
      );
      const result = await run(snapshotPage(page, { interactive: true }));
      expect(Object.values(result.refs).filter((entry) => entry.role === "link").length).toBe(3);
    });

    it("should produce consistent refs for the same content", async () => {
      await page.setContent(`<html><body><button>A</button><button>B</button></body></html>`);
      const first = await run(snapshotPage(page));
      const second = await run(snapshotPage(page));
      expect(first.refs).toEqual(second.refs);
    });
  });
});
