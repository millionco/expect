import { Effect, Layer, Option } from "effect";
import { describe, it, expect } from "vite-plus/test";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";

const playwrightLayer = Playwright.layer.pipe(Layer.provide(Artifacts.layerTest(() => {})));

const run = <A>(effect: Effect.Effect<A, unknown, Playwright>) =>
  Effect.runPromise(effect.pipe(Effect.provide(playwrightLayer)));

const withPage = (
  content: string,
  fn: (pw: typeof Playwright.Service) => Effect.Effect<unknown, unknown>,
) =>
  run(
    Effect.gen(function* () {
      const pw = yield* Playwright;
      yield* pw.open({
        headless: true,
        browserProfile: Option.none(),
        initialNavigation: Option.none(),
        cdpUrl: Option.none(),
      });
      const page = yield* pw.getPage;
      yield* Effect.tryPromise(() => page.setContent(content));
      return yield* fn(pw);
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (pw.hasSession()) yield* pw.close();
        }),
      ),
    ),
  );

describe("act", () => {
  it("should perform a click action and return updated snapshot", async () => {
    await withPage(
      `<html><body><button onclick="this.textContent='Clicked!'">Click Me</button></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const before = yield* pw.snapshot({});
          const buttonRef = Object.keys(before.refs).find(
            (key) => before.refs[key].name === "Click Me",
          );
          expect(buttonRef).toBeDefined();

          const after = yield* pw.act(buttonRef!, (locator) => locator.click());
          expect(after.tree).toContain("Clicked!");
        }),
    );
  });

  it("should perform a fill action and return updated snapshot", async () => {
    await withPage(
      `<html><body><label for="name">Name</label><input id="name" type="text" /></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const before = yield* pw.snapshot({});
          const inputRef = Object.keys(before.refs).find(
            (key) => before.refs[key].role === "textbox",
          );
          expect(inputRef).toBeDefined();

          const after = yield* pw.act(inputRef!, (locator) => locator.fill("Alice"));
          expect(after.tree).toContain("Alice");
        }),
    );
  });

  it("should toggle a checkbox via act", async () => {
    await withPage(
      `<html><body><input type="checkbox" aria-label="Accept terms" /></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const before = yield* pw.snapshot({});
          const checkboxRef = Object.keys(before.refs).find(
            (key) => before.refs[key].role === "checkbox",
          );
          expect(checkboxRef).toBeDefined();

          yield* pw.act(checkboxRef!, (locator) => locator.check());
          const page = yield* pw.getPage;
          const isChecked = yield* Effect.tryPromise(() =>
            page.locator('[aria-label="Accept terms"]').isChecked(),
          );
          expect(isChecked).toBe(true);
        }),
    );
  });

  it("should return a snapshot with valid refs after action", async () => {
    await withPage(
      `<html><body><button onclick="document.body.innerHTML='<a href=\\'/new\\'>New Link</a>'">Replace</button></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const before = yield* pw.snapshot({});
          const buttonRef = Object.keys(before.refs).find(
            (key) => before.refs[key].role === "button",
          );
          expect(buttonRef).toBeDefined();

          const after = yield* pw.act(buttonRef!, (locator) => locator.click());
          expect(after.tree).toContain("link");
          expect(after.tree).toContain("New Link");

          const linkRef = Object.keys(after.refs).find((key) => after.refs[key].role === "link");
          expect(linkRef).toBeDefined();
          const locator = yield* after.locator(linkRef!);
          expect(yield* Effect.tryPromise(() => locator.textContent())).toBe("New Link");
        }),
    );
  });

  it("should forward snapshot options", async () => {
    await withPage(
      `<html><body><h1>Title</h1><button onclick="this.textContent='Done'">Action</button></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const interactiveBefore = yield* pw.snapshot({ interactive: true });
          const buttonRef = Object.keys(interactiveBefore.refs).find(
            (key) => interactiveBefore.refs[key].role === "button",
          );
          expect(buttonRef).toBeDefined();

          const after = yield* pw.act(buttonRef!, (locator) => locator.click(), {
            interactive: true,
          });
          const roles = Object.values(after.refs).map((entry) => entry.role);
          expect(roles).not.toContain("heading");
          expect(roles).toContain("button");
        }),
    );
  });

  it("should handle actions on duplicate-named elements", async () => {
    await withPage(
      `<html><body><button onclick="document.title='first'">Go</button><button onclick="document.title='second'">Go</button></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const before = yield* pw.snapshot({});
          const goButtons = Object.entries(before.refs).filter(
            ([, entry]) => entry.role === "button" && entry.name === "Go",
          );
          expect(goButtons.length).toBe(2);

          yield* pw.act(goButtons[1][0], (locator) => locator.click());
          const page = yield* pw.getPage;
          expect(yield* Effect.tryPromise(() => page.title())).toBe("second");
        }),
    );
  });

  it("should handle select option action", async () => {
    await withPage(
      `<html><body><label for="fruit">Fruit</label><select id="fruit"><option value="apple">Apple</option><option value="banana">Banana</option></select></body></html>`,
      (pw) =>
        Effect.gen(function* () {
          const before = yield* pw.snapshot({});
          const selectRef = Object.keys(before.refs).find(
            (key) => before.refs[key].role === "combobox",
          );
          expect(selectRef).toBeDefined();

          yield* pw.act(selectRef!, async (locator) => {
            await locator.selectOption("banana");
          });
          const page = yield* pw.getPage;
          const value = yield* Effect.tryPromise(() => page.locator("#fruit").inputValue());
          expect(value).toBe("banana");
        }),
    );
  });
});
