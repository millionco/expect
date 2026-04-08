import { Browsers, Cookies, layerLive, browserKeyOf, Cookie } from "@expect/cookies";
import type { Browser as BrowserProfile } from "@expect/cookies";
import { chromium, webkit, firefox } from "playwright";
import type { Locator, Page } from "playwright";
import type { BrowserEngine } from "./types";
import { Array as Arr, Effect, Layer, Option, ServiceMap } from "effect";

const cookiesLayer = Layer.mergeAll(layerLive, Cookies.layer);
import {
  AGENT_OVERLAY_CONTAINER_ID,
  CONTENT_ROLES,
  HEADLESS_CHROMIUM_ARGS,
  INTERACTIVE_ROLES,
  NAVIGATION_DETECT_DELAY_MS,
  OVERLAY_CONTAINER_ID,
  POST_NAVIGATION_SETTLE_MS,
  VIDEO_HEIGHT_PX,
  VIDEO_WIDTH_PX,
  REF_PREFIX,
  SNAPSHOT_TIMEOUT_MS,
  CDP_CONNECT_TIMEOUT_MS,
} from "./constants";
import {
  BrowserLaunchError,
  CdpConnectionError,
  NavigationError,
  SnapshotTimeoutError,
} from "./errors";
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
import type { ScrollContainerResult } from "./runtime/lib/scroll-detection";

const BROWSER_ENGINES = { chromium, webkit, firefox } as const;

const resolveBrowserType = (engine: BrowserEngine) => BROWSER_ENGINES[engine];

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

const dedupCookies = (cookies: readonly Cookie[]) =>
  Arr.dedupeWith(
    cookies,
    (cookieA, cookieB) =>
      cookieA.name === cookieB.name &&
      cookieA.domain === cookieB.domain &&
      cookieA.path === cookieB.path,
  );

const extractDefaultBrowserCookies = Effect.fn("Browser.extractDefaultBrowserCookies")(function* (
  url: string,
  preferredProfile: BrowserProfile | undefined,
) {
  if (!preferredProfile) return [];

  const cookiesService = yield* Cookies;
  const cookies = yield* extractCookiesForProfile(cookiesService, preferredProfile);
  return dedupCookies(cookies);
}, Effect.provide(cookiesLayer));

const extractCookiesForBrowserKeys = Effect.fn("Browser.extractCookiesForBrowserKeys")(function* (
  browserKeys: readonly string[],
) {
  const cookiesService = yield* Cookies;
  const browsers = yield* Browsers;
  const allProfiles = yield* browsers.list.pipe(
    Effect.catchTag("ListBrowsersError", () => Effect.succeed<BrowserProfile[]>([])),
  );

  const matchingProfiles = allProfiles.filter((profile) =>
    browserKeys.includes(browserKeyOf(profile)),
  );

  const results = yield* Effect.forEach(
    matchingProfiles,
    (profile) => extractCookiesForProfile(cookiesService, profile),
    { concurrency: "unbounded" },
  );

  return dedupCookies(results.flat());
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
  // oxlint-disable-next-line require-yield
  make: Effect.gen(function* () {
    const createPage = Effect.fn("Browser.createPage")(function* (
      url: string | undefined,
      options: CreatePageOptions = {},
    ) {
      const engine = options.browserType ?? "chromium";
      const cdpUrl = engine === "chromium" ? (options.cdpUrl ?? Option.none()) : Option.none();
      yield* Effect.annotateCurrentSpan({
        url: url ?? "about:blank",
        cdp: Option.isSome(cdpUrl),
        browserType: engine,
      });

      const browserType = resolveBrowserType(engine);
      const browser =
        cdpUrl._tag === "Some"
          ? yield* Effect.tryPromise({
              try: () => chromium.connectOverCDP(cdpUrl.value),
              catch: (cause) =>
                new CdpConnectionError({
                  endpointUrl: cdpUrl.value,
                  cause: cause instanceof Error ? cause.message : String(cause),
                }),
            }).pipe(
              Effect.timeoutOrElse({
                duration: `${CDP_CONNECT_TIMEOUT_MS} millis`,
                onTimeout: () =>
                  new CdpConnectionError({
                    endpointUrl: cdpUrl.value,
                    cause: `Connection timed out after ${CDP_CONNECT_TIMEOUT_MS}ms`,
                  }).asEffect(),
              }),
            )
          : yield* Effect.tryPromise({
              try: () =>
                browserType.launch({
                  headless: !options.headed,
                  executablePath: options.executablePath,
                  args: engine === "chromium" && !options.headed ? HEADLESS_CHROMIUM_ARGS : [],
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

        const contextOptions: Parameters<typeof browser.newContext>[0] = {
          ignoreHTTPSErrors: true,
        };
        if (profileLocale) {
          contextOptions.locale = profileLocale;
        }
        if (options.videoOutputDir) {
          contextOptions.recordVideo = {
            dir: options.videoOutputDir,
            size: { width: VIDEO_WIDTH_PX, height: VIDEO_HEIGHT_PX },
          };
        }

        const isCdpConnected = Option.isSome(cdpUrl);
        const existingContexts = isCdpConnected ? browser.contexts() : [];
        const context =
          existingContexts.length > 0
            ? existingContexts[0]!
            : yield* Effect.tryPromise({
                try: () => browser.newContext(contextOptions),
                catch: toBrowserLaunchError,
              });

        yield* Effect.tryPromise({
          try: () => context.addInitScript(RUNTIME_SCRIPT),
          catch: toBrowserLaunchError,
        });

        if (isCdpConnected && existingContexts.length > 0) {
          const existingPages = context.pages();
          for (const existingPage of existingPages) {
            yield* Effect.tryPromise({
              try: () => existingPage.evaluate(RUNTIME_SCRIPT),
              catch: toBrowserLaunchError,
            }).pipe(
              Effect.catchTag("BrowserLaunchError", (cause) =>
                Effect.logDebug("Failed to inject runtime into existing CDP page", { cause }),
              ),
            );
          }
        }

        if (options.cookies && !isCdpConnected) {
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

        return { browser, context, page, cleanup: Effect.void, isExternalBrowser: isCdpConnected };
      });

      return yield* setupPage.pipe(
        Effect.tapError(() => {
          if (Option.isSome(cdpUrl)) return Effect.void;
          return Effect.tryPromise(() => browser.close()).pipe(
            Effect.catchTag("UnknownError", () => Effect.void),
          );
        }),
      );
    });

    const NO_SCROLL_CONTAINERS: ScrollContainerResult[] = [];

    const takeAriaSnapshot = Effect.fn("Browser.takeAriaSnapshot")(function* (
      page: Page,
      options: SnapshotOptions,
    ) {
      const timeout = options.timeout ?? SNAPSHOT_TIMEOUT_MS;
      const selector = options.selector ?? "body";
      const useViewportAware = options.viewportAware ?? true;

      const scrollContainers: ScrollContainerResult[] = useViewportAware
        ? yield* evaluateRuntime(page, "prepareViewportSnapshot").pipe(
            Effect.catchCause((cause) =>
              Effect.logDebug("Viewport snapshot preparation failed, falling back to full tree", {
                cause,
              }).pipe(Effect.as(NO_SCROLL_CONTAINERS)),
            ),
          )
        : NO_SCROLL_CONTAINERS;

      const restore =
        scrollContainers.length > 0
          ? evaluateRuntime(page, "restoreViewportSnapshot").pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Viewport snapshot restoration failed", { cause }),
              ),
            )
          : Effect.void;

      const rawTree = yield* Effect.ensuring(
        Effect.tryPromise({
          try: () => page.locator(selector).ariaSnapshot({ timeout }),
          catch: (cause) =>
            new SnapshotTimeoutError({
              selector,
              timeoutMs: timeout,
              cause: cause instanceof Error ? cause.message : String(cause),
            }),
        }),
        restore,
      );

      return { rawTree, scrollContainers };
    });

    const snapshot = Effect.fn("Browser.snapshot")(function* (
      page: Page,
      options: SnapshotOptions = {},
    ) {
      yield* Effect.annotateCurrentSpan({ selector: options.selector ?? "body" });

      const { rawTree, scrollContainers } = yield* takeAriaSnapshot(page, options);

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

      const stats = computeSnapshotStats(tree, refs, scrollContainers);

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

      yield* evaluateRuntime(page, "hideAgentOverlay", AGENT_OVERLAY_CONTAINER_ID).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Failed to hide agent overlay for capture", { cause }),
        ),
      );
      yield* injectOverlayLabels(page, labelPositions);
      return yield* Effect.ensuring(
        Effect.tryPromise({
          try: () => page.screenshot({ fullPage: options.fullPage, scale: "css" }),
          catch: toBrowserLaunchError,
        }).pipe(Effect.map((screenshotBuffer) => ({ screenshot: screenshotBuffer, annotations }))),
        // HACK: overlay removal is best-effort cleanup — evaluateRuntime uses Effect.promise which defects on failure
        evaluateRuntime(page, "removeOverlay", OVERLAY_CONTAINER_ID).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Failed to remove annotation overlay", { cause }),
          ),
          Effect.tap(() =>
            evaluateRuntime(page, "showAgentOverlay", AGENT_OVERLAY_CONTAINER_ID).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Failed to show agent overlay after capture", { cause }),
              ),
            ),
          ),
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

    const preExtractCookies = Effect.fn("Browser.preExtractCookies")(function* (
      browserKeys?: readonly string[],
    ) {
      if (browserKeys && browserKeys.length > 0) {
        return yield* extractCookiesForBrowserKeys(browserKeys);
      }
      const { preferredProfile } = yield* resolveDefaultBrowserContext();
      return yield* extractDefaultBrowserCookies("", preferredProfile);
    });

    const resolveProfile = Effect.fn("Browser.resolveProfile")(function* (profileName: string) {
      const browsers = yield* Browsers;
      const allBrowsers = yield* browsers.list;
      const chromiumProfile = allBrowsers.find(
        (browser) => browser._tag === "ChromiumBrowser" && browser.profileName === profileName,
      );
      return chromiumProfile?._tag === "ChromiumBrowser" ? chromiumProfile : undefined;
    }, Effect.provide(layerLive));

    const resolveProfilePath = Effect.fn("Browser.resolveProfilePath")(function* (
      profileName: string,
    ) {
      const chromiumProfile = yield* resolveProfile(profileName);
      return chromiumProfile?.profilePath;
    }, Effect.provide(layerLive));

    return {
      createPage,
      snapshot,
      act,
      annotatedScreenshot,
      waitForNavigationSettle,
      preExtractCookies,
      resolveProfile,
      resolveProfilePath,
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
