import { Browsers, Cookies, layerLive } from "@browser-tester/cookies";
import type { Browser as BrowserProfile } from "@browser-tester/cookies";
import { chromium } from "playwright";
import type { Locator, Page } from "playwright";
import { Effect, Layer, Option, ServiceMap } from "effect";

const cookiesLayer = Layer.mergeAll(layerLive, Cookies.layer);
import {
  CONTENT_ROLES,
  HEADLESS_CHROMIUM_ARGS,
  INTERACTIVE_ROLES,
  NAVIGATION_DETECT_DELAY_MS,
  OVERLAY_CONTAINER_ID,
  POST_NAVIGATION_SETTLE_MS,
  REF_PREFIX,
  SNAPSHOT_TIMEOUT_MS,
} from "./constants";
import { BrowserLaunchError, NavigationError, SnapshotTimeoutError } from "./errors";
import { toActionError } from "./utils/action-error";
import { compactTree } from "./utils/compact-tree";
import { createLocator } from "./utils/create-locator";
import { evaluateRuntime } from "./utils/evaluate-runtime";
import { findCursorInteractive } from "./utils/find-cursor-interactive";
import { getIndentLevel } from "./utils/get-indent-level";
import { parseAriaLine } from "./utils/parse-aria-line";
import { resolveNthDuplicates } from "./utils/resolve-nth-duplicates";
import { computeSnapshotStats } from "./utils/snapshot-stats";
import { RUNTIME_SCRIPT } from "./generated/runtime-script";
import type {
  AnnotatedScreenshotOptions,
  Annotation,
  CreatePageOptions,
  RefMap,
  SnapshotOptions,
} from "./types";

const shouldAssignRef = (role: string, name: string, interactive?: boolean): boolean => {
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (interactive) return false;
  return CONTENT_ROLES.has(role) && name.length > 0;
};

const toBrowserLaunchError = (cause: unknown) =>
  new BrowserLaunchError({
    cause: cause instanceof Error ? cause.message : String(cause),
  });

const resolveDefaultBrowserContext = Effect.fn("Browser.resolveDefaultBrowserContext")(
  function* () {
    const browsers = yield* Browsers;
    const maybeDefault = yield* browsers
      .defaultBrowser()
      .pipe(
        Effect.catchTag("ListBrowsersError", () => Effect.succeed(Option.none<BrowserProfile>())),
      );

    return { preferredProfile: Option.getOrUndefined(maybeDefault) };
  },
  Effect.provide(layerLive),
);

const extractCookiesForProfile = Effect.fn("Browser.extractCookiesForProfile")(
  function* (cookiesService: typeof Cookies.Service, profile: BrowserProfile) {
    return yield* cookiesService.extract(profile);
  },
  Effect.catchTags({
    ExtractionError: () => Effect.succeed([]),
    PlatformError: Effect.die,
  }),
);

const extractDefaultBrowserCookies = Effect.fn("Browser.extractDefaultBrowserCookies")(function* (
  url: string,
  preferredProfile: BrowserProfile | undefined,
) {
  if (!preferredProfile) return [];

  const cookiesService = yield* Cookies;

  const profileCookies = yield* extractCookiesForProfile(cookiesService, preferredProfile);
  if (profileCookies.length > 0) return profileCookies;

  const browsers = yield* Browsers;
  const allProfiles = yield* browsers.list.pipe(
    Effect.catchTag("ListBrowsersError", () => Effect.succeed<BrowserProfile[]>([])),
  );
  const matchingProfiles = allProfiles.filter((profile) => {
    if (preferredProfile._tag === "ChromiumBrowser" && profile._tag === "ChromiumBrowser") {
      return profile.key === preferredProfile.key;
    }
    return profile._tag === preferredProfile._tag;
  });

  const results = yield* Effect.forEach(
    matchingProfiles,
    (profile) => extractCookiesForProfile(cookiesService, profile),
    { concurrency: "unbounded" },
  );
  return results.flat();
}, Effect.provide(cookiesLayer));

const appendCursorInteractiveElements = Effect.fn("Browser.appendCursorInteractive")(function* (
  page: Page,
  filteredLines: string[],
  refs: RefMap,
  refCount: number,
  options: SnapshotOptions,
) {
  const cursorElements = yield* findCursorInteractive(page, options.selector);
  if (cursorElements.length === 0) return refCount;

  const existingNames = new Set(Object.values(refs).map((entry) => entry.name.toLowerCase()));
  const newLines: string[] = [];

  for (const element of cursorElements) {
    if (existingNames.has(element.text.toLowerCase())) continue;
    existingNames.add(element.text.toLowerCase());

    const ref = `${REF_PREFIX}${++refCount}`;
    refs[ref] = {
      role: "clickable",
      name: element.text,
      selector: element.selector,
    };
    newLines.push(`- clickable "${element.text}" [ref=${ref}] [${element.reason}]`);
  }

  if (newLines.length > 0) {
    filteredLines.push("# Cursor-interactive elements:");
    filteredLines.push(...newLines);
  }

  return refCount;
});

const injectOverlayLabels = (page: Page, labels: Array<{ label: number; x: number; y: number }>) =>
  evaluateRuntime(page, "injectOverlayLabels", OVERLAY_CONTAINER_ID, labels);

export class Browser extends ServiceMap.Service<Browser>()("@browser/Browser", {
  make: Effect.gen(function* () {
    const createPage = Effect.fn("Browser.createPage")(function* (
      url: string | undefined,
      options: CreatePageOptions = {},
    ) {
      yield* Effect.annotateCurrentSpan({ url: url ?? "about:blank" });

      const browser = yield* Effect.tryPromise({
        try: () =>
          chromium.launch({
            headless: !options.headed,
            executablePath: options.executablePath,
            args: options.headed ? [] : HEADLESS_CHROMIUM_ARGS,
          }),
        catch: toBrowserLaunchError,
      });

      const setupPage = Effect.gen(function* () {
        const defaultBrowserContext =
          options.cookies === true
            ? yield* resolveDefaultBrowserContext()
            : { preferredProfile: undefined };

        const profileLocale =
          defaultBrowserContext.preferredProfile?._tag === "ChromiumBrowser"
            ? defaultBrowserContext.preferredProfile.locale
            : undefined;

        const context = yield* Effect.tryPromise({
          try: () => browser.newContext(profileLocale ? { locale: profileLocale } : undefined),
          catch: toBrowserLaunchError,
        });

        yield* Effect.tryPromise({
          try: () => context.addInitScript(RUNTIME_SCRIPT),
          catch: toBrowserLaunchError,
        });

        if (options.cookies) {
          const cookies = Array.isArray(options.cookies)
            ? options.cookies
            : yield* extractDefaultBrowserCookies(
                url ?? "",
                defaultBrowserContext.preferredProfile,
              );
          yield* Effect.tryPromise({
            try: () => context.addCookies(cookies.map((cookie) => cookie.playwrightFormat)),
            catch: toBrowserLaunchError,
          });
        }

        const page = yield* Effect.tryPromise({
          try: () => context.newPage(),
          catch: toBrowserLaunchError,
        });

        if (url) {
          yield* Effect.tryPromise({
            try: () => page.goto(url, { waitUntil: options.waitUntil ?? "load" }),
            catch: (cause) =>
              new NavigationError({
                url,
                cause: cause instanceof Error ? cause.message : String(cause),
              }),
          });
        }

        return { browser, context, page };
      });

      return yield* setupPage.pipe(
        Effect.tapError(() =>
          Effect.tryPromise(() => browser.close()).pipe(
            Effect.catchTag("UnknownError", () => Effect.void),
          ),
        ),
      );
    });

    const snapshot = Effect.fn("Browser.snapshot")(function* (
      page: Page,
      options: SnapshotOptions = {},
    ) {
      const timeout = options.timeout ?? SNAPSHOT_TIMEOUT_MS;
      const selector = options.selector ?? "body";
      yield* Effect.annotateCurrentSpan({ selector });

      const rawTree = yield* Effect.tryPromise({
        try: () => page.locator(selector).ariaSnapshot({ timeout }),
        catch: (cause) =>
          new SnapshotTimeoutError({
            selector,
            timeoutMs: timeout,
            cause: cause instanceof Error ? cause.message : String(cause),
          }),
      });

      const refs: RefMap = {};
      const filteredLines: string[] = [];
      let refCount = 0;

      for (const line of rawTree.split("\n")) {
        if (options.maxDepth !== undefined && getIndentLevel(line) > options.maxDepth) continue;

        const parsed = parseAriaLine(line);
        if (Option.isNone(parsed)) {
          if (!options.interactive) filteredLines.push(line);
          continue;
        }

        const { role, name } = parsed.value;
        if (options.interactive && !INTERACTIVE_ROLES.has(role)) continue;

        if (shouldAssignRef(role, name, options.interactive)) {
          const ref = `${REF_PREFIX}${++refCount}`;
          refs[ref] = { role, name };
          filteredLines.push(`${line} [ref=${ref}]`);
        } else {
          filteredLines.push(line);
        }
      }

      if (options.cursor) {
        refCount = yield* appendCursorInteractiveElements(
          page,
          filteredLines,
          refs,
          refCount,
          options,
        );
      }

      resolveNthDuplicates(refs);

      let tree = filteredLines.join("\n");
      if (options.interactive && refCount === 0) tree = "(no interactive elements)";
      if (options.compact) tree = compactTree(tree);

      const stats = computeSnapshotStats(tree, refs);

      return { tree, refs, stats, locator: createLocator(page, refs) };
    });

    const act = Effect.fn("Browser.act")(function* (
      page: Page,
      ref: string,
      action: (locator: Locator) => Promise<void>,
      options?: SnapshotOptions,
    ) {
      yield* Effect.annotateCurrentSpan({ ref });
      const before = yield* snapshot(page, options);
      const locator = yield* before.locator(ref);
      yield* Effect.tryPromise({
        try: () => action(locator),
        catch: (error) => toActionError(error, ref),
      });
      return yield* snapshot(page, options);
    });

    const annotatedScreenshot = Effect.fn("Browser.annotatedScreenshot")(function* (
      page: Page,
      options: AnnotatedScreenshotOptions = {},
    ) {
      const snapshotResult = yield* snapshot(page, options);
      const annotations: Annotation[] = [];
      const labelPositions: Array<{ label: number; x: number; y: number }> = [];

      let labelCounter = 0;

      for (const [ref, entry] of Object.entries(snapshotResult.refs)) {
        const locator = yield* snapshotResult.locator(ref);
        const box = yield* Effect.tryPromise(() => locator.boundingBox()).pipe(
          Effect.catchTag("UnknownError", () => Effect.succeed(undefined)),
        );
        if (!box) continue;

        labelCounter++;
        annotations.push({ label: labelCounter, ref, role: entry.role, name: entry.name });
        labelPositions.push({ label: labelCounter, x: box.x, y: box.y });
      }

      yield* injectOverlayLabels(page, labelPositions);
      return yield* Effect.ensuring(
        Effect.tryPromise({
          try: () => page.screenshot({ fullPage: options.fullPage }),
          catch: toBrowserLaunchError,
        }).pipe(Effect.map((screenshotBuffer) => ({ screenshot: screenshotBuffer, annotations }))),
        // HACK: overlay removal is best-effort cleanup — evaluateRuntime uses Effect.promise which defects on failure
        evaluateRuntime(page, "removeOverlay", OVERLAY_CONTAINER_ID).pipe(
          Effect.catchCause(() => Effect.void),
        ),
      );
    });

    const waitForNavigationSettle = Effect.fn("Browser.waitForNavigationSettle")(function* (
      page: Page,
      urlBefore: string,
    ) {
      yield* Effect.tryPromise({
        try: () =>
          page.waitForURL((url) => url.toString() !== urlBefore, {
            timeout: NAVIGATION_DETECT_DELAY_MS,
            waitUntil: "commit",
          }),
        catch: toBrowserLaunchError,
      }).pipe(Effect.catchTag("BrowserLaunchError", () => Effect.void));
      if (page.url() !== urlBefore) {
        yield* Effect.tryPromise(() => page.waitForLoadState("domcontentloaded")).pipe(
          Effect.catchTag("UnknownError", () => Effect.void),
        );
        yield* Effect.tryPromise({
          try: () => page.waitForTimeout(POST_NAVIGATION_SETTLE_MS),
          catch: toBrowserLaunchError,
        });
      }
    });

    const preExtractCookies = Effect.fn("Browser.preExtractCookies")(function* () {
      const { preferredProfile } = yield* resolveDefaultBrowserContext();
      const cookies = yield* extractDefaultBrowserCookies("", preferredProfile);
      return cookies;
    });

    return {
      createPage,
      snapshot,
      act,
      annotatedScreenshot,
      waitForNavigationSettle,
      preExtractCookies,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}

export const runBrowser = <A>(
  effect: (browser: typeof Browser.Service) => Effect.Effect<A, unknown>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const browser = yield* Browser;
      return yield* effect(browser);
    }).pipe(Effect.provide(Browser.layer)),
  );
