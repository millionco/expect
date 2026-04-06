import type { Locator, Page } from "playwright";
import { Effect, Layer, ServiceMap } from "effect";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { AGENT_OVERLAY_CONTAINER_ID } from "../constants";
import type { ExpectRuntime } from "../generated/runtime-types";
import type { SnapshotResult } from "../types";

const REF_PATTERN = /ref\s*\(\s*['"](\w+)['"]\s*\)/;
const REF_PATTERN_GLOBAL = /ref\s*\(\s*['"](\w+)['"]\s*\)/g;

const SELECTOR_PATTERNS = [
  /querySelector\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /querySelectorAll\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /\$\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /\$\$\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /locator\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /getByRole\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /getByText\s*\(\s*['"]([^'"]+)['"]\s*\)/,
];

const safeOverlayEval = <K extends keyof ExpectRuntime>(
  page: Page,
  method: K,
  ...args: Parameters<ExpectRuntime[K]>
) => evaluateRuntime(page, method, ...args).pipe(Effect.catchCause(() => Effect.void));

const extractCssSelector = (code: string): string | undefined => {
  for (const pattern of SELECTOR_PATTERNS) {
    const match = code.match(pattern);
    if (match) return match[1];
  }
  return undefined;
};

const resolveCssSelector = (_page: Page, locator: Locator) =>
  Effect.tryPromise(() =>
    locator.evaluate((element: Element) => {
      const runtime = (globalThis as Record<string, unknown>).__EXPECT_RUNTIME__ as
        | { cssSelector: (element: Element) => string }
        | undefined;
      if (!runtime?.cssSelector) return undefined;
      return runtime.cssSelector(element);
    }),
  ).pipe(Effect.catchCause(() => Effect.succeed<string | undefined>(undefined)));

export class OverlayController extends ServiceMap.Service<OverlayController>()(
  "@browser/OverlayController",
  {
    make: Effect.gen(function* () {
      const updateLabel = Effect.fn("OverlayController.updateLabel")(function* (
        page: Page,
        label: string,
      ) {
        yield* safeOverlayEval(page, "updateCursor", AGENT_OVERLAY_CONTAINER_ID, -1, -1, label);
      });

      const hide = (page: Page) =>
        safeOverlayEval(page, "hideAgentOverlay", AGENT_OVERLAY_CONTAINER_ID);

      const show = (page: Page) =>
        safeOverlayEval(page, "showAgentOverlay", AGENT_OVERLAY_CONTAINER_ID);

      const withHidden = <A, E>(page: Page, effect: Effect.Effect<A, E>) =>
        Effect.ensuring(hide(page).pipe(Effect.flatMap(() => effect)), show(page));

      const moveCursorToRef = Effect.fn("OverlayController.moveCursorToRef")(function* (
        page: Page,
        snapshot: SnapshotResult,
        refId: string,
        label: string,
      ) {
        if (!snapshot.refs[refId]) return;
        const locator = yield* snapshot.locator(refId);
        const box = yield* Effect.tryPromise(() => locator.boundingBox()).pipe(
          Effect.catchTag("UnknownError", () => Effect.succeed(undefined)),
        );
        if (!box) return;

        const selector = yield* resolveCssSelector(page, locator);
        yield* safeOverlayEval(
          page,
          "updateCursor",
          AGENT_OVERLAY_CONTAINER_ID,
          box.x + box.width / 2,
          box.y + box.height / 2,
          label,
          selector ?? "",
        );
      });

      const moveCursorToSelector = Effect.fn("OverlayController.moveCursorToSelector")(function* (
        page: Page,
        selector: string,
        label: string,
      ) {
        const result = yield* Effect.tryPromise(() =>
          page.evaluate(
            ([sel]) => {
              const element = document.querySelector(sel);
              if (!element) return undefined;
              const box = element.getBoundingClientRect();
              const runtime = (globalThis as Record<string, unknown>).__EXPECT_RUNTIME__ as
                | { cssSelector: (element: Element) => string }
                | undefined;
              const cssSelector = runtime?.cssSelector ? runtime.cssSelector(element) : undefined;
              return {
                x: box.x + box.width / 2,
                y: box.y + box.height / 2,
                selector: cssSelector,
              };
            },
            [selector],
          ),
        ).pipe(Effect.catchCause(() => Effect.succeed(undefined)));

        if (result) {
          yield* safeOverlayEval(
            page,
            "updateCursor",
            AGENT_OVERLAY_CONTAINER_ID,
            result.x,
            result.y,
            label,
            result.selector ?? "",
          );
        }
      });

      const clearHighlights = (page: Page) =>
        safeOverlayEval(page, "clearHighlights", AGENT_OVERLAY_CONTAINER_ID);

      const highlightRefsInCode = Effect.fn("OverlayController.highlightRefsInCode")(function* (
        page: Page,
        snapshot: SnapshotResult,
        code: string,
      ) {
        const matches = [...code.matchAll(REF_PATTERN_GLOBAL)];
        const uniqueRefIds = [...new Set(matches.map((match) => match[1]))];

        const selectors: string[] = [];
        for (const refId of uniqueRefIds) {
          if (!snapshot.refs[refId]) continue;
          const locator = yield* snapshot.locator(refId);
          const selector = yield* resolveCssSelector(page, locator);
          if (selector) {
            selectors.push(selector);
          }
        }

        yield* safeOverlayEval(page, "highlightRefs", AGENT_OVERLAY_CONTAINER_ID, selectors);
      });

      const logAction = (page: Page, label: string, code: string) =>
        safeOverlayEval(page, "logAction", AGENT_OVERLAY_CONTAINER_ID, label, code);

      const positionCursorForCode = Effect.fn("OverlayController.positionCursorForCode")(function* (
        page: Page,
        code: string,
        label: string,
        snapshot: SnapshotResult | undefined,
      ) {
        yield* clearHighlights(page);

        const refMatch = code.match(REF_PATTERN);
        if (refMatch && snapshot) {
          yield* moveCursorToRef(page, snapshot, refMatch[1], label);
          yield* highlightRefsInCode(page, snapshot, code);
          return;
        }

        const cssSelector = extractCssSelector(code);
        if (cssSelector) {
          yield* moveCursorToSelector(page, cssSelector, label);
          return;
        }

        yield* updateLabel(page, label);
      });

      return {
        updateLabel,
        hide,
        show,
        withHidden,
        clearHighlights,
        logAction,
        positionCursorForCode,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}
