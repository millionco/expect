import { Browsers, Cookies, layerLive } from "@browser-tester/cookies";
import type { Browser as BrowserProfile, Cookie } from "@browser-tester/cookies";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import type { Locator, Page } from "playwright";
import { Effect, Layer, Option, ServiceMap } from "effect";

const cookiesLayer = Layer.mergeAll(layerLive, Cookies.layer);
import {
  CONTENT_ROLES,
  DEFAULT_VIDEO_HEIGHT_PX,
  DEFAULT_VIDEO_WIDTH_PX,
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
  VideoOptions,
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

const resolveDefaultBrowserContext = () =>
  Effect.gen(function* () {
    const browsers = yield* Browsers;
    const maybeDefault = yield* browsers
      .defaultBrowser()
      .pipe(
        Effect.catchTag("ListBrowsersError", () => Effect.succeed(Option.none<BrowserProfile>())),
      );

    return Option.match(maybeDefault, {
      onNone: () => ({ preferredProfile: undefined as BrowserProfile | undefined }),
      onSome: (profile) => ({ preferredProfile: profile as BrowserProfile | undefined }),
    });
  }).pipe(Effect.provide(layerLive), Effect.withSpan("Browser.resolveDefaultBrowserContext"));

const extractCookiesSafe = (cookiesService: typeof Cookies.Service, profile: BrowserProfile) =>
  Effect.gen(function* () {
    const result = yield* cookiesService.extract(profile);
    return result as Cookie[];
  }).pipe(
    Effect.catchTag("ExtractionError", () => Effect.succeed([] as Cookie[])),
    Effect.catchTag("PlatformError", () => Effect.succeed([] as Cookie[])),
  );

const extractDefaultBrowserCookies = (url: string, preferredProfile: BrowserProfile | undefined) =>
  Effect.gen(function* () {
    if (!preferredProfile) return [] as Cookie[];

    const cookiesService = yield* Cookies;

    const profileCookies = yield* extractCookiesSafe(cookiesService, preferredProfile);
    if (profileCookies.length > 0) return profileCookies;

    const browsers = yield* Browsers;
    const allProfiles = yield* browsers.list.pipe(
      Effect.catchTag("ListBrowsersError", () => Effect.succeed([] as BrowserProfile[])),
    );
    const matchingProfiles = allProfiles.filter((profile) => {
      if (preferredProfile._tag === "ChromiumBrowser" && profile._tag === "ChromiumBrowser") {
        return profile.key === preferredProfile.key;
      }
      return profile._tag === preferredProfile._tag;
    });

    const results = yield* Effect.forEach(
      matchingProfiles,
      (profile) => extractCookiesSafe(cookiesService, profile),
      { concurrency: "unbounded" },
    );
    return results.flat() as Cookie[];
  }).pipe(Effect.provide(cookiesLayer), Effect.withSpan("Browser.extractDefaultBrowserCookies"));

const resolveContextOptions = (
  video: boolean | VideoOptions | undefined,
  locale: string | undefined,
) => {
  const defaultSize = { width: DEFAULT_VIDEO_WIDTH_PX, height: DEFAULT_VIDEO_HEIGHT_PX };
  const recordVideo = video
    ? video === true
      ? { dir: tmpdir(), size: defaultSize }
      : { ...video, size: video.size ?? defaultSize }
    : undefined;

  if (!recordVideo && !locale) return undefined;
  return {
    ...(recordVideo ? { recordVideo } : {}),
    ...(locale ? { locale } : {}),
  };
};

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
            : { preferredProfile: undefined as BrowserProfile | undefined };

        const profileLocale =
          defaultBrowserContext.preferredProfile?._tag === "ChromiumBrowser"
            ? defaultBrowserContext.preferredProfile.locale
            : undefined;

        const context = yield* Effect.tryPromise({
          try: () => browser.newContext(resolveContextOptions(options.video, profileLocale)),
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
        Effect.tapError(() => Effect.tryPromise(() => browser.close()).pipe(Effect.ignore)),
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
          Effect.orElseSucceed(() => null),
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
        evaluateRuntime(page, "removeOverlay", OVERLAY_CONTAINER_ID).pipe(Effect.ignore),
      );
    });

    const saveVideo = Effect.fn("Browser.saveVideo")(function* (page: Page, outputPath: string) {
      const video = page.video();
      if (!video) return undefined;
      yield* Effect.tryPromise({
        try: () => page.close(),
        catch: toBrowserLaunchError,
      });
      yield* Effect.tryPromise({
        try: () => video.saveAs(outputPath),
        catch: toBrowserLaunchError,
      });
      return outputPath;
    });

    const waitForNavigationSettle = Effect.fn("Browser.waitForNavigationSettle")(function* (
      page: Page,
      urlBefore: string,
    ) {
      yield* Effect.tryPromise({
        try: () => page.waitForTimeout(NAVIGATION_DETECT_DELAY_MS),
        catch: toBrowserLaunchError,
      });
      if (page.url() !== urlBefore) {
        yield* Effect.tryPromise(() => page.waitForLoadState("domcontentloaded")).pipe(
          Effect.ignore,
        );
        yield* Effect.tryPromise({
          try: () => page.waitForTimeout(POST_NAVIGATION_SETTLE_MS),
          catch: toBrowserLaunchError,
        });
      }
    });

    return {
      createPage,
      snapshot,
      act,
      annotatedScreenshot,
      saveVideo,
      waitForNavigationSettle,
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
