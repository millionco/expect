import type { Locator, Page } from "playwright";
import { Effect, Layer, ServiceMap } from "effect";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { AGENT_OVERLAY_CONTAINER_ID } from "../constants";
import type { ExpectRuntime } from "../generated/runtime-types";
import type { SnapshotResult } from "../types";

const REF_PATTERN = /ref\s*\(\s*['"](\w+)['"]\s*\)/;
const REF_PATTERN_GLOBAL = /ref\s*\(\s*['"](\w+)['"]\s*\)/g;

interface LocatorMatch {
  kind: "css" | "locator" | "role" | "text" | "label" | "placeholder" | "testId";
  value: string;
  name?: string;
}

const LOCATOR_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  kind: LocatorMatch["kind"];
  nameGroup?: number;
}> = [
  { pattern: /querySelector\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "css" },
  { pattern: /querySelectorAll\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "css" },
  { pattern: /\$\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "css" },
  { pattern: /\$\$\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "css" },
  { pattern: /locator\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "locator" },
  {
    pattern:
      /getByRole\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{[^}]*name:\s*['"]([^'"]+)['"][^}]*\})?\s*\)/,
    kind: "role",
    nameGroup: 2,
  },
  { pattern: /getByText\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "text" },
  { pattern: /getByLabel\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "label" },
  { pattern: /getByPlaceholder\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "placeholder" },
  { pattern: /getByTestId\s*\(\s*['"]([^'"]+)['"]\s*\)/, kind: "testId" },
];

const safeOverlayEval = <K extends keyof ExpectRuntime>(
  page: Page,
  method: K,
  ...args: Parameters<ExpectRuntime[K]>
) =>
  evaluateRuntime(page, method, ...args).pipe(
    Effect.catchCause((cause) => Effect.logDebug("Overlay eval failed", { method, cause })),
  );

const extractLocatorMatch = (code: string): LocatorMatch | undefined => {
  for (const { pattern, kind, nameGroup } of LOCATOR_PATTERNS) {
    const match = code.match(pattern);
    if (match) {
      return { kind, value: match[1], name: nameGroup ? match[nameGroup] : undefined };
    }
  }
  return undefined;
};

const resolvePlaywrightLocator = (page: Page, match: LocatorMatch): Locator => {
  switch (match.kind) {
    case "css":
    case "locator":
      return page.locator(match.value);
    case "role":
      return match.name
        ? page.getByRole(match.value as Parameters<Page["getByRole"]>[0], { name: match.name })
        : page.getByRole(match.value as Parameters<Page["getByRole"]>[0]);
    case "text":
      return page.getByText(match.value);
    case "label":
      return page.getByLabel(match.value);
    case "placeholder":
      return page.getByPlaceholder(match.value);
    case "testId":
      return page.getByTestId(match.value);
  }
};

const resolveCssSelector = (locator: Locator) =>
  Effect.tryPromise(() =>
    locator.evaluate((element: Element) => {
      const runtime = (globalThis as Record<string, unknown>).__EXPECT_RUNTIME__ as
        | { cssSelector: (element: Element) => string }
        | undefined;
      if (!runtime?.cssSelector) return undefined;
      return runtime.cssSelector(element);
    }),
  ).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("CSS selector resolution failed", { cause }).pipe(
        Effect.as<string | undefined>(undefined),
      ),
    ),
  );

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

      const hide = Effect.fn("OverlayController.hide")(function* (page: Page) {
        yield* safeOverlayEval(page, "hideAgentOverlay", AGENT_OVERLAY_CONTAINER_ID);
      });

      const show = Effect.fn("OverlayController.show")(function* (page: Page) {
        yield* safeOverlayEval(page, "showAgentOverlay", AGENT_OVERLAY_CONTAINER_ID);
      });

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

        const selector = yield* resolveCssSelector(locator);
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

      const moveCursorToLocator = Effect.fn("OverlayController.moveCursorToLocator")(function* (
        page: Page,
        match: LocatorMatch,
        label: string,
      ) {
        const locator = resolvePlaywrightLocator(page, match).first();
        const box = yield* Effect.tryPromise(() => locator.boundingBox()).pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("Bounding box resolution failed", { cause }).pipe(Effect.as(undefined)),
          ),
        );
        if (!box) return;

        const selector = yield* resolveCssSelector(locator);
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

      const clearHighlights = Effect.fn("OverlayController.clearHighlights")(function* (
        page: Page,
      ) {
        yield* safeOverlayEval(page, "clearHighlights", AGENT_OVERLAY_CONTAINER_ID);
      });

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
          const selector = yield* resolveCssSelector(locator);
          if (selector) {
            selectors.push(selector);
          }
        }

        yield* safeOverlayEval(page, "highlightRefs", AGENT_OVERLAY_CONTAINER_ID, selectors);
      });

      const highlightLocatorsInCode = Effect.fn("OverlayController.highlightLocatorsInCode")(
        function* (page: Page, code: string) {
          const selectors: string[] = [];
          for (const { pattern, kind, nameGroup } of LOCATOR_PATTERNS) {
            const globalPattern = new RegExp(pattern.source, "g");
            for (const match of code.matchAll(globalPattern)) {
              const locatorMatch: LocatorMatch = {
                kind,
                value: match[1],
                name: nameGroup ? match[nameGroup] : undefined,
              };
              const locator = resolvePlaywrightLocator(page, locatorMatch).first();
              const selector = yield* resolveCssSelector(locator);
              if (selector) {
                selectors.push(selector);
              }
            }
          }

          if (selectors.length > 0) {
            yield* safeOverlayEval(page, "highlightRefs", AGENT_OVERLAY_CONTAINER_ID, selectors);
          }
        },
      );

      const logAction = Effect.fn("OverlayController.logAction")(function* (
        page: Page,
        label: string,
        code: string,
      ) {
        yield* safeOverlayEval(page, "logAction", AGENT_OVERLAY_CONTAINER_ID, label, code);
      });

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

        const locatorMatch = extractLocatorMatch(code);
        if (locatorMatch) {
          yield* moveCursorToLocator(page, locatorMatch, label);
          yield* highlightLocatorsInCode(page, code);
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
