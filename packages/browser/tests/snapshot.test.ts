import { Effect, Layer } from "effect";
import { describe, it, expect } from "vite-plus/test";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";
import type { SnapshotOptions } from "../src/types";

const playwrightLayer = Playwright.layer.pipe(Layer.provide(Artifacts.layer));

const run = <A>(effect: Effect.Effect<A, unknown, Playwright>) =>
  Effect.runPromise(effect.pipe(Effect.provide(playwrightLayer)));

const withPage = <A>(
  content: string,
  fn: (pw: typeof Playwright.Service) => Effect.Effect<A, unknown>,
) =>
  run(
    Effect.gen(function* () {
      const pw = yield* Playwright;
      yield* pw.open("about:blank");
      const page = yield* pw.assertPageExists();
      yield* Effect.tryPromise(() => page.setContent(content));
      return yield* fn(pw);
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (pw.hasSession()) yield* pw.close().pipe(Effect.ignore);
        }),
      ),
    ),
  );

const snapshotContent = (content: string, options: SnapshotOptions = {}) =>
  withPage(content, (pw) => pw.snapshot(options));

describe("snapshot", () => {
  describe("tree and refs", () => {
    it("should return a tree with refs", async () => {
      const result = await snapshotContent(`
        <html><body>
          <h1>Hello World</h1>
          <a href="/about">About</a>
        </body></html>
      `);
      expect(result.tree).toContain("heading");
      expect(result.tree).toContain("Hello World");
      expect(result.tree).toContain("[ref=e1]");
      expect(typeof result.refs).toBe("object");
      expect(Object.keys(result.refs).length).toBeGreaterThan(0);
    });

    it("should assign sequential ref ids", async () => {
      const result = await snapshotContent(`
        <html><body>
          <button>First</button>
          <button>Second</button>
          <button>Third</button>
        </body></html>
      `);
      expect(result.refs.e1).toBeDefined();
      expect(result.refs.e2).toBeDefined();
      expect(result.refs.e3).toBeDefined();
    });

    it("should store role and name in refs", async () => {
      const result = await snapshotContent(`
        <html><body>
          <button>Submit</button>
        </body></html>
      `);
      const buttonRef = Object.values(result.refs).find((entry) => entry.name === "Submit");
      expect(buttonRef).toBeDefined();
      expect(buttonRef?.role).toBe("button");
    });

    it("should handle empty name", async () => {
      const result = await snapshotContent(`
        <html><body>
          <button></button>
        </body></html>
      `);
      const buttonRef = Object.values(result.refs).find((entry) => entry.role === "button");
      expect(buttonRef).toBeDefined();
      expect(buttonRef?.name).toBe("");
    });
  });

  describe("nth disambiguation", () => {
    it("should set nth on duplicate role+name entries", async () => {
      const result = await snapshotContent(`
        <html><body>
          <button>OK</button>
          <button>OK</button>
          <button>Cancel</button>
        </body></html>
      `);
      const okButtons = Object.values(result.refs).filter(
        (entry) => entry.role === "button" && entry.name === "OK",
      );
      expect(okButtons.length).toBe(2);
      expect(okButtons[0].nth).toBe(0);
      expect(okButtons[1].nth).toBe(1);
    });

    it("should not set nth on unique role+name entries", async () => {
      const result = await snapshotContent(`
        <html><body>
          <button>OK</button>
          <button>Cancel</button>
        </body></html>
      `);
      for (const entry of Object.values(result.refs)) {
        expect(entry.nth).toBeUndefined();
      }
    });
  });

  describe("locator", () => {
    it("should resolve ref to a working locator", async () => {
      await withPage(`<html><body><h1>Title</h1><button>Click Me</button></body></html>`, (pw) =>
        Effect.gen(function* () {
          const result = yield* pw.snapshot();
          const buttonRefKey = Object.keys(result.refs).find(
            (key) => result.refs[key].name === "Click Me",
          );
          expect(buttonRefKey).toBeDefined();
          const locator = yield* result.locator(buttonRefKey!);
          const text = yield* Effect.tryPromise(() => locator.textContent());
          expect(text).toBe("Click Me");
        }),
      );
    });

    it("should fail on unknown ref with available refs", async () => {
      await expect(
        withPage(`<html><body><button>OK</button></body></html>`, (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            yield* result.locator("nonexistent");
          }),
        ),
      ).rejects.toThrow("available refs: e1");
    });

    it("should fail on unknown ref with empty page hint", async () => {
      await expect(
        withPage("<html><body></body></html>", (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            yield* result.locator("e1");
          }),
        ),
      ).rejects.toThrow("no refs available");
    });

    it("should click the correct element via ref", async () => {
      await withPage(
        `<html><body><button onclick="document.title='clicked'">Click Me</button></body></html>`,
        (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            const buttonRefKey = Object.keys(result.refs).find(
              (key) => result.refs[key].name === "Click Me",
            );
            const locator = yield* result.locator(buttonRefKey!);
            yield* Effect.tryPromise(() => locator.click());
            const page = yield* pw.assertPageExists();
            expect(yield* Effect.tryPromise(() => page.title())).toBe("clicked");
          }),
      );
    });

    it("should click the correct unnamed button among named buttons", async () => {
      await withPage(
        `<html><body><button>OK</button><button onclick="document.title='unnamed'"></button><button>Cancel</button></body></html>`,
        (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            const unnamedButtons = Object.entries(result.refs).filter(
              ([, entry]) => entry.role === "button" && !entry.name,
            );
            expect(unnamedButtons.length).toBe(1);
            const [refKey] = unnamedButtons[0];
            const locator = yield* result.locator(refKey);
            yield* Effect.tryPromise(() => locator.click());
            const page = yield* pw.assertPageExists();
            expect(yield* Effect.tryPromise(() => page.title())).toBe("unnamed");
          }),
      );
    });

    it("should click the correct duplicate button via nth", async () => {
      await withPage(
        `<html><body><button onclick="document.title='first'">OK</button><button onclick="document.title='second'">OK</button></body></html>`,
        (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            const okButtons = Object.entries(result.refs).filter(
              ([, entry]) => entry.role === "button" && entry.name === "OK",
            );
            expect(okButtons.length).toBe(2);
            const locator = yield* result.locator(okButtons[1][0]);
            yield* Effect.tryPromise(() => locator.click());
            const page = yield* pw.assertPageExists();
            expect(yield* Effect.tryPromise(() => page.title())).toBe("second");
          }),
      );
    });

    it("should fill an input via ref", async () => {
      await withPage(
        `<html><body><label for="email">Email</label><input id="email" type="text" /></body></html>`,
        (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            const inputRefKey = Object.keys(result.refs).find(
              (key) => result.refs[key].role === "textbox",
            );
            expect(inputRefKey).toBeDefined();
            const locator = yield* result.locator(inputRefKey!);
            yield* Effect.tryPromise(() => locator.fill("test@example.com"));
            const page = yield* pw.assertPageExists();
            const value = yield* Effect.tryPromise(() => page.locator("#email").inputValue());
            expect(value).toBe("test@example.com");
          }),
      );
    });

    it("should select an option via ref", async () => {
      await withPage(
        `<html><body><label for="color">Color</label><select id="color"><option value="red">Red</option><option value="blue">Blue</option></select></body></html>`,
        (pw) =>
          Effect.gen(function* () {
            const result = yield* pw.snapshot();
            const selectRefKey = Object.keys(result.refs).find(
              (key) => result.refs[key].role === "combobox",
            );
            expect(selectRefKey).toBeDefined();
            const locator = yield* result.locator(selectRefKey!);
            yield* Effect.tryPromise(() => locator.selectOption("blue"));
            const page = yield* pw.assertPageExists();
            const value = yield* Effect.tryPromise(() => page.locator("#color").inputValue());
            expect(value).toBe("blue");
          }),
      );
    });
  });

  describe("timeout", () => {
    it("should accept a custom timeout", async () => {
      const result = await snapshotContent("<html><body><p>Hello</p></body></html>", {
        timeout: 5000,
      });
      expect(result.tree).toContain("paragraph");
    });
  });

  describe("interactive filter", () => {
    it("should only include interactive elements", async () => {
      const result = await snapshotContent(
        `<html><body>
          <h1>Title</h1>
          <p>Description</p>
          <button>Submit</button>
          <a href="/link">Link</a>
          <input type="text" placeholder="Name" />
        </body></html>`,
        { interactive: true },
      );
      const roles = Object.values(result.refs).map((entry) => entry.role);
      expect(roles).toContain("button");
      expect(roles).toContain("link");
      expect(roles).toContain("textbox");
      expect(roles).not.toContain("heading");
      expect(roles).not.toContain("paragraph");
    });

    it("should return no interactive elements message for static page", async () => {
      const result = await snapshotContent(
        `<html><body><h1>Title</h1><p>Just text</p></body></html>`,
        { interactive: true },
      );
      expect(result.tree).toBe("(no interactive elements)");
      expect(Object.keys(result.refs).length).toBe(0);
    });

    it("should exclude non-interactive tree lines", async () => {
      const result = await snapshotContent(
        `<html><body><h1>Title</h1><button>OK</button></body></html>`,
        { interactive: true },
      );
      expect(result.tree).not.toContain("heading");
      expect(result.tree).toContain("button");
    });
  });

  describe("compact filter", () => {
    it("should remove empty structural nodes without refs", async () => {
      const content = `<html><body><div><div><button>Deep</button></div></div></body></html>`;
      const full = await snapshotContent(content);
      const compacted = await snapshotContent(content, { compact: true });
      expect(compacted.tree.split("\n").length).toBeLessThanOrEqual(full.tree.split("\n").length);
      expect(compacted.tree).toContain("button");
      expect(compacted.tree).toContain("[ref=");
    });

    it("should keep structural parents of ref-bearing children", async () => {
      const result = await snapshotContent(
        `<html><body><nav><a href="/home">Home</a><a href="/about">About</a></nav></body></html>`,
        { compact: true },
      );
      expect(result.tree).toContain("navigation");
      expect(result.tree).toContain("link");
    });
  });

  describe("maxDepth filter", () => {
    it("should limit tree depth", async () => {
      const content = `<html><body><nav><ul><li><a href="/home">Home</a></li><li><a href="/about">About</a></li></ul></nav></body></html>`;
      const shallow = await snapshotContent(content, { maxDepth: 1 });
      const deep = await snapshotContent(content);
      expect(shallow.tree.split("\n").length).toBeLessThan(deep.tree.split("\n").length);
    });

    it("should return top-level elements only at depth 0", async () => {
      const result = await snapshotContent(
        `<html><body><h1>Title</h1><nav><a href="/link">Link</a></nav></body></html>`,
        { maxDepth: 0 },
      );
      for (const line of result.tree.split("\n")) {
        if (line.trim()) expect(line).toMatch(/^- /);
      }
    });
  });

  describe("combined filters", () => {
    it("should apply interactive and compact together", async () => {
      const result = await snapshotContent(
        `<html><body>
          <h1>Title</h1>
          <div><div><button>Submit</button></div></div>
          <p>Footer text</p>
        </body></html>`,
        { interactive: true, compact: true },
      );
      expect(result.tree).toContain("button");
      expect(result.tree).not.toContain("heading");
      expect(result.tree).not.toContain("paragraph");
      expect(Object.keys(result.refs).length).toBe(1);
    });

    it("should apply interactive and maxDepth together", async () => {
      const result = await snapshotContent(
        `<html><body>
          <nav><ul><li><a href="/home">Home</a></li></ul></nav>
          <button>Top</button>
        </body></html>`,
        { interactive: true, maxDepth: 0 },
      );
      const roles = Object.values(result.refs).map((entry) => entry.role);
      expect(roles).toContain("button");
      expect(roles).not.toContain("link");
    });

    it("should apply compact and maxDepth together", async () => {
      const result = await snapshotContent(
        `<html><body>
          <nav aria-label="Main"><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></nav>
          <div><div><p>Deep text</p></div></div>
        </body></html>`,
        { compact: true, maxDepth: 2 },
      );
      expect(result.tree).toContain("navigation");
    });

    it("should apply all three filters together", async () => {
      const result = await snapshotContent(
        `<html><body>
          <header>
            <h1>Title</h1>
            <nav><ul><li><a href="/a">Link A</a></li><li><a href="/b">Link B</a></li></ul></nav>
          </header>
          <main>
            <p>Content</p>
            <div><div><button>Deep Button</button></div></div>
          </main>
        </body></html>`,
        { interactive: true, compact: true, maxDepth: 1 },
      );
      expect(result.tree).not.toContain("heading");
      expect(result.tree).not.toContain("paragraph");
    });
  });

  describe("diverse interactive roles", () => {
    it("should handle radio buttons", async () => {
      const result = await snapshotContent(
        `<html><body><fieldset><legend>Size</legend><label><input type="radio" name="size" value="s" /> Small</label><label><input type="radio" name="size" value="m" /> Medium</label></fieldset></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("radio");
    });

    it("should handle checkboxes", async () => {
      const result = await snapshotContent(
        `<html><body><label><input type="checkbox" /> Accept terms</label></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("checkbox");
    });

    it("should handle sliders", async () => {
      const result = await snapshotContent(
        `<html><body><label for="vol">Volume</label><input id="vol" type="range" min="0" max="100" /></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("slider");
    });

    it("should handle switch role", async () => {
      const result = await snapshotContent(
        `<html><body><button role="switch" aria-checked="false" aria-label="Dark mode">Toggle</button></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("switch");
    });

    it("should handle tab role", async () => {
      const result = await snapshotContent(
        `<html><body><div role="tablist"><button role="tab" aria-selected="true">Tab 1</button><button role="tab" aria-selected="false">Tab 2</button></div></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).filter((entry) => entry.role === "tab").length).toBe(2);
    });

    it("should handle searchbox", async () => {
      const result = await snapshotContent(
        `<html><body><input type="search" aria-label="Search" /></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("searchbox");
    });

    it("should handle spinbutton", async () => {
      const result = await snapshotContent(
        `<html><body><label for="qty">Quantity</label><input id="qty" type="number" /></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).toContain("spinbutton");
    });
  });

  describe("edge cases", () => {
    it("should handle a completely empty body", async () => {
      const result = await snapshotContent("<html><body></body></html>");
      expect(Object.keys(result.refs).length).toBe(0);
    });

    it("should handle elements with special characters in names", async () => {
      const result = await snapshotContent(
        `<html><body><button>Save &amp; Continue</button></body></html>`,
      );
      const entry = Object.values(result.refs).find((ref) => ref.role === "button");
      expect(entry).toBeDefined();
      expect(entry?.name).toContain("&");
    });

    it("should handle multiple nested forms", async () => {
      const result = await snapshotContent(
        `<html><body><form aria-label="Login"><label for="user">Username</label><input id="user" type="text" /><button type="submit">Login</button></form><form aria-label="Search"><input type="search" aria-label="Query" /><button type="submit">Search</button></form></body></html>`,
      );
      expect(Object.values(result.refs).filter((entry) => entry.role === "button").length).toBe(2);
      expect(
        Object.values(result.refs).filter(
          (entry) => entry.role === "textbox" || entry.role === "searchbox",
        ).length,
      ).toBe(2);
    });

    it("should handle aria-label overriding visible text", async () => {
      const result = await snapshotContent(
        `<html><body><button aria-label="Close dialog">X</button></body></html>`,
      );
      const entry = Object.values(result.refs).find((ref) => ref.role === "button");
      expect(entry?.name).toBe("Close dialog");
    });

    it("should handle large number of elements", async () => {
      const items = Array.from(
        { length: 50 },
        (_, index) => `<button>Button ${index}</button>`,
      ).join("");
      const result = await snapshotContent(`<html><body>${items}</body></html>`);
      expect(Object.keys(result.refs).length).toBe(50);
      expect(result.refs.e1).toBeDefined();
      expect(result.refs.e50).toBeDefined();
    });

    it("should handle default options when none are provided", async () => {
      const result = await snapshotContent(`<html><body><h1>Hello</h1></body></html>`);
      expect(result.tree).toBeTruthy();
      expect(result.refs).toBeDefined();
      expect(typeof result.locator).toBe("function");
    });

    it("should exclude text role from refs", async () => {
      const result = await snapshotContent(
        `<html><body><p>Some plain text</p><button>Action</button></body></html>`,
      );
      expect(Object.values(result.refs).map((entry) => entry.role)).not.toContain("text");
    });

    it("should handle nested interactive elements inside structural containers", async () => {
      const result = await snapshotContent(
        `<html><body><nav><ul><li><a href="/1">Link 1</a></li><li><a href="/2">Link 2</a></li><li><a href="/3">Link 3</a></li></ul></nav></body></html>`,
        { interactive: true },
      );
      expect(Object.values(result.refs).filter((entry) => entry.role === "link").length).toBe(3);
    });

    it("should produce consistent refs for the same content", async () => {
      await withPage(`<html><body><button>A</button><button>B</button></body></html>`, (pw) =>
        Effect.gen(function* () {
          const first = yield* pw.snapshot();
          const second = yield* pw.snapshot();
          expect(first.refs).toEqual(second.refs);
        }),
      );
    });
  });
});
