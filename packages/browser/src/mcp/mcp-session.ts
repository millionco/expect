import path from "node:path";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import { Config, Deferred, Effect, Layer, Option, Ref, ServiceMap } from "effect";
import type { Cookie } from "@expect/cookies";
import { FileSystem } from "effect/FileSystem";
import { isRunningInAgent } from "@expect/shared/launched-from";
import { Browser } from "../browser";
import { NavigationError } from "../errors";
import { concatVideos, frameWithWallpaper, DEFAULT_WALLPAPER_PATH } from "../video-processor";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { AGENT_OVERLAY_CONTAINER_ID } from "../constants";
import type {
  AnnotatedScreenshotOptions,
  BrowserEngine,
  SnapshotOptions,
  SnapshotResult,
} from "../types";
import {
  EXPECT_COOKIE_BROWSERS_ENV_NAME,
  EXPECT_CDP_URL_ENV_NAME,
  EXPECT_BASE_URL_ENV_NAME,
  EXPECT_HEADED_ENV_NAME,
} from "./constants";
import { McpSessionNotOpenError } from "./errors";

interface ConsoleEntry {
  readonly type: string;
  readonly text: string;
  readonly timestamp: number;
}

interface NetworkEntry {
  readonly url: string;
  readonly method: string;
  status: number | undefined;
  readonly resourceType: string;
  readonly timestamp: number;
}

export interface BrowserSessionData {
  readonly browser: PlaywrightBrowser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly cleanup: Effect.Effect<void>;
  readonly isExternalBrowser: boolean;
  readonly consoleMessages: ConsoleEntry[];
  readonly networkRequests: NetworkEntry[];
  readonly trackedPages: Set<Page>;
  lastSnapshot: SnapshotResult | undefined;
}

export interface OpenOptions {
  headed?: boolean;
  cookies?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  cdpUrl?: Option.Option<string>;
  browserType?: BrowserEngine;
}

export interface OpenResult {
  readonly injectedCookieCount: number;
  readonly isExternalBrowser: boolean;
}

export interface CloseResult {
  readonly videoPath: string | undefined;
  readonly tmpVideoPath: string | undefined;
  readonly screenshotPaths: readonly string[];
}

const TMP_ARTIFACT_OUTPUT_DIRECTORY = "/tmp/expect-replays";
const PLAYWRIGHT_VIDEO_SUBDIRECTORY = "playwright";

const setupPageTracking = (page: Page, sessionData: BrowserSessionData) => {
  if (sessionData.trackedPages.has(page)) return;
  sessionData.trackedPages.add(page);

  page.on("console", (message) => {
    sessionData.consoleMessages.push({
      type: message.type(),
      text: message.text(),
      timestamp: Date.now(),
    });
  });

  page.on("request", (request) => {
    sessionData.networkRequests.push({
      url: request.url(),
      method: request.method(),
      status: undefined,
      resourceType: request.resourceType(),
      timestamp: Date.now(),
    });
  });

  page.on("response", (response) => {
    const entry = sessionData.networkRequests.find(
      (networkEntry) => networkEntry.url === response.url() && networkEntry.status === undefined,
    );
    if (entry) entry.status = response.status();
  });
};

export class McpSession extends ServiceMap.Service<McpSession>()("@browser/McpSession", {
  make: Effect.gen(function* () {
    const browserService = yield* Browser;
    const fileSystem = yield* FileSystem;
    const cookieBrowsersConfig = yield* Config.option(
      Config.string(EXPECT_COOKIE_BROWSERS_ENV_NAME),
    );
    const defaultCdpUrl = yield* Config.option(Config.string(EXPECT_CDP_URL_ENV_NAME));
    const baseUrlConfig = yield* Config.option(Config.string(EXPECT_BASE_URL_ENV_NAME));
    const configuredBaseUrl = Option.getOrUndefined(baseUrlConfig);
    const headedConfig = yield* Config.option(Config.string(EXPECT_HEADED_ENV_NAME));
    const isHeadedDefault = Option.match(headedConfig, {
      onNone: () => !isRunningInAgent(),
      onSome: (value) => value !== "false",
    });
    const cookieBrowserKeys = Option.match(cookieBrowsersConfig, {
      onNone: () => [] as string[],
      onSome: (value) => value.split(",").filter(Boolean),
    });
    const cookiesDisabled = cookieBrowserKeys.length === 0;

    const sessionRef = yield* Ref.make<BrowserSessionData | undefined>(undefined);
    const preExtractedCookiesRef = yield* Ref.make<Cookie[] | undefined>(undefined);
    const preExtractedCookiesDeferredRef = yield* Ref.make<
      Deferred.Deferred<Cookie[] | undefined, never> | undefined
    >(undefined);
    const savedScreenshotPathsRef = yield* Ref.make<string[]>([]);
    const videoSegmentsRef = yield* Ref.make<string[]>([]);
    const isHeadedRef = yield* Ref.make<boolean>(isHeadedDefault);

    const saveScreenshot = Effect.fn("McpSession.saveScreenshot")(function* (buffer: Buffer) {
      const currentPaths = yield* Ref.get(savedScreenshotPathsRef);
      const screenshotIndex = currentPaths.length;
      const screenshotPath = path.join(
        TMP_ARTIFACT_OUTPUT_DIRECTORY,
        `screenshot-${screenshotIndex}.png`,
      );
      yield* fileSystem
        .makeDirectory(TMP_ARTIFACT_OUTPUT_DIRECTORY, { recursive: true })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("Failed to create screenshot directory", { cause }),
          ),
        );
      yield* fileSystem.writeFile(screenshotPath, new Uint8Array(buffer)).pipe(
        Effect.tap(() =>
          Ref.update(savedScreenshotPathsRef, (paths) => [...paths, screenshotPath]),
        ),
        Effect.tap(() =>
          Effect.logDebug("Screenshot saved", { path: screenshotPath, index: screenshotIndex }),
        ),
        Effect.catchCause((cause) => Effect.logWarning("Failed to save screenshot", { cause })),
      );
    });

    const startPreExtractCookies = Effect.fn("McpSession.startPreExtractCookies")(function* () {
      if (cookiesDisabled) return;

      const existingDeferred = yield* Ref.get(preExtractedCookiesDeferredRef);
      if (existingDeferred) return;

      const deferred = yield* Deferred.make<Cookie[] | undefined, never>();
      yield* Ref.set(preExtractedCookiesDeferredRef, deferred);

      yield* browserService.preExtractCookies(cookieBrowserKeys).pipe(
        Effect.tap((cookies) => Ref.set(preExtractedCookiesRef, cookies)),
        Effect.tap((cookies) => Effect.logInfo("Cookies pre-extracted", { count: cookies.length })),
        Effect.catchCause((cause) =>
          Effect.logWarning("Cookie pre-extraction failed", { cause }).pipe(
            Effect.as(undefined as Cookie[] | undefined),
          ),
        ),
        Effect.flatMap((cookies) => Deferred.succeed(deferred, cookies)),
        Effect.ensuring(Ref.set(preExtractedCookiesDeferredRef, undefined)),
        Effect.forkDetach,
      );
    });

    yield* startPreExtractCookies();

    const resolveUrl = (url: string): string => {
      if (configuredBaseUrl && !url.startsWith("http://") && !url.startsWith("https://")) {
        try {
          return new URL(url, configuredBaseUrl).toString();
        } catch {
          return url;
        }
      }
      return url;
    };

    const requireSession = Effect.fn("McpSession.requireSession")(function* () {
      const session = yield* Ref.get(sessionRef);
      if (!session) return yield* new McpSessionNotOpenError();
      return session;
    });

    const requirePage = Effect.fn("McpSession.requirePage")(function* () {
      return (yield* requireSession()).page;
    });

    const resolveCookies = Effect.fn("McpSession.resolveCookies")(function* (
      cookies: OpenOptions["cookies"],
    ) {
      if (cookies !== true) return cookies;

      const preExtracted = yield* Ref.get(preExtractedCookiesRef);
      if (preExtracted !== undefined) return preExtracted;

      const sharedExtraction = yield* Ref.get(preExtractedCookiesDeferredRef);
      if (!sharedExtraction) return true;

      const sharedCookies = yield* Deferred.await(sharedExtraction);
      if (sharedCookies !== undefined) return sharedCookies;

      return true;
    });

    const ensureOverlay = (page: import("playwright").Page) =>
      evaluateRuntime(page, "initAgentOverlay", AGENT_OVERLAY_CONTAINER_ID).pipe(
        Effect.catchCause(() => Effect.void),
      );

    const navigate = Effect.fn("McpSession.navigate")(function* (
      url: string,
      options: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" } = {},
    ) {
      const resolved = resolveUrl(url);
      const sessionData = yield* requireSession();
      yield* Effect.tryPromise({
        try: () => sessionData.page.goto(resolved, { waitUntil: options.waitUntil ?? "load" }),
        catch: (cause) =>
          new NavigationError({
            url: resolved,
            cause: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      const currentHeaded = yield* Ref.get(isHeadedRef);
      if (currentHeaded) {
        yield* ensureOverlay(sessionData.page);
      }
    });

    const open = Effect.fn("McpSession.open")(function* (
      rawUrl: string,
      options: OpenOptions = {},
    ) {
      const url = resolveUrl(rawUrl);
      yield* Effect.annotateCurrentSpan({ url });
      yield* Ref.set(savedScreenshotPathsRef, []);
      yield* Ref.set(videoSegmentsRef, []);

      const cookiesOption = yield* resolveCookies(options.cookies);
      const videoOutputDir = path.join(
        TMP_ARTIFACT_OUTPUT_DIRECTORY,
        PLAYWRIGHT_VIDEO_SUBDIRECTORY,
      );

      yield* fileSystem
        .makeDirectory(videoOutputDir, { recursive: true })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("Failed to create Playwright video directory", { cause }),
          ),
        );

      const cdpUrl = Option.orElse(options.cdpUrl ?? Option.none(), () => defaultCdpUrl);
      const headed = options.headed ?? isHeadedDefault;
      yield* Ref.set(isHeadedRef, headed);

      const pageResult = yield* browserService.createPage(url, {
        headed,
        cookies: cookiesOption,
        waitUntil: options.waitUntil,
        videoOutputDir,
        cdpUrl,
        browserType: options.browserType,
      });

      const sessionData: BrowserSessionData = {
        browser: pageResult.browser,
        context: pageResult.context,
        page: pageResult.page,
        cleanup: pageResult.cleanup,
        isExternalBrowser: pageResult.isExternalBrowser,
        consoleMessages: [],
        networkRequests: [],
        trackedPages: new Set(),
        lastSnapshot: undefined,
      };
      setupPageTracking(pageResult.page, sessionData);
      yield* Ref.set(sessionRef, sessionData);

      if (headed) {
        yield* Effect.tryPromise({
          try: () =>
            pageResult.context.addInitScript(`
              const __expectInitOverlay = () => {
                if (typeof globalThis.__EXPECT_RUNTIME__ !== 'undefined' && typeof globalThis.__EXPECT_RUNTIME__.initAgentOverlay === 'function') {
                  globalThis.__EXPECT_RUNTIME__.initAgentOverlay('${AGENT_OVERLAY_CONTAINER_ID}');
                }
              };
              if (document.body) { __expectInitOverlay(); }
              else { document.addEventListener('DOMContentLoaded', __expectInitOverlay); }
            `),
          catch: () => undefined,
        }).pipe(Effect.catchCause(() => Effect.void));

        yield* ensureOverlay(pageResult.page).pipe(
          Effect.tap(() => Effect.logDebug("Agent overlay injected")),
          Effect.catchCause((cause) =>
            Effect.logDebug("Agent overlay injection failed", { cause }),
          ),
        );

        pageResult.page.on("load", () => {
          pageResult.page
            .evaluate(
              `if(typeof globalThis.__EXPECT_RUNTIME__!=='undefined'){globalThis.__EXPECT_RUNTIME__.initAgentOverlay('${AGENT_OVERLAY_CONTAINER_ID}')}`,
            )
            .catch(() => {});
        });

        yield* evaluateRuntime(
          pageResult.page,
          "updateCursor",
          AGENT_OVERLAY_CONTAINER_ID,
          -1,
          -1,
          `Navigated to ${url}`,
        ).pipe(Effect.catchCause(() => Effect.void));
      }

      const injectedCookieCount = yield* Effect.tryPromise(() => pageResult.context.cookies()).pipe(
        Effect.map((cookies) => cookies.length),
        Effect.catchCause((cause) =>
          Effect.logDebug("Failed to count cookies", { cause }).pipe(Effect.as(0)),
        ),
      );

      return {
        injectedCookieCount,
        isExternalBrowser: pageResult.isExternalBrowser,
      } satisfies OpenResult;
    });

    const snapshot = Effect.fn("McpSession.snapshot")(function* (
      page: Page,
      options?: SnapshotOptions,
    ) {
      return yield* browserService.snapshot(page, options);
    });

    const annotatedScreenshot = Effect.fn("McpSession.annotatedScreenshot")(function* (
      page: Page,
      options?: AnnotatedScreenshotOptions,
    ) {
      return yield* browserService.annotatedScreenshot(page, options);
    });

    const updateLastSnapshot = Effect.fn("McpSession.updateLastSnapshot")(function* (
      snapshotResult: SnapshotResult,
    ) {
      const sessionData = yield* requireSession();
      sessionData.lastSnapshot = snapshotResult;
    });

    const close = Effect.fn("McpSession.close")(function* () {
      const activeSession = yield* Ref.get(sessionRef);
      if (!activeSession) return undefined;

      yield* Ref.set(sessionRef, undefined);

      let videoPath: string | undefined;
      let tmpVideoPath: string | undefined;
      const pageVideo = activeSession.page.video();
      const artifactBaseName = `session-${Date.now()}`;

      if (!activeSession.page.isClosed()) {
        yield* evaluateRuntime(
          activeSession.page,
          "destroyAgentOverlay",
          AGENT_OVERLAY_CONTAINER_ID,
        ).pipe(Effect.catchCause(() => Effect.void));
      }

      if (activeSession.isExternalBrowser) {
        yield* Effect.tryPromise(() => activeSession.page.close()).pipe(
          Effect.catchCause((cause) => Effect.logDebug("Failed to close page", { cause })),
        );
      } else {
        yield* Effect.tryPromise(() => activeSession.browser.close()).pipe(
          Effect.catchCause((cause) => Effect.logDebug("Failed to close browser", { cause })),
        );
      }

      yield* activeSession.cleanup.pipe(
        Effect.catchCause((cause) =>
          Effect.logDebug("Failed to clean up Chrome process", { cause }),
        ),
      );

      if (pageVideo) {
        videoPath = yield* Effect.tryPromise(() => pageVideo.path()).pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("Failed to resolve Playwright video path", { cause }).pipe(
              Effect.as(undefined),
            ),
          ),
        );

        if (videoPath) {
          const confirmedVideoPath = videoPath;
          yield* Ref.update(videoSegmentsRef, (segments) => [...segments, confirmedVideoPath]);

          const allSegments = yield* Ref.get(videoSegmentsRef);

          yield* fileSystem
            .makeDirectory(TMP_ARTIFACT_OUTPUT_DIRECTORY, { recursive: true })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to create /tmp artifact directory", { cause }),
              ),
            );

          const rawConcatPath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `${artifactBaseName}-raw.webm`,
          );
          const tmpVideoFilePath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `${artifactBaseName}.webm`,
          );

          yield* concatVideos(allSegments, rawConcatPath).pipe(
            Effect.catchTag("VideoProcessError", (error) =>
              Effect.logWarning("Video concat failed, using last segment", {
                error: error.message,
              }).pipe(
                Effect.tap(() =>
                  fileSystem
                    .copyFile(confirmedVideoPath, rawConcatPath)
                    .pipe(Effect.catchCause(() => Effect.void)),
                ),
              ),
            ),
          );

          yield* frameWithWallpaper(rawConcatPath, tmpVideoFilePath, DEFAULT_WALLPAPER_PATH).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                tmpVideoPath = tmpVideoFilePath;
              }),
            ),
            Effect.catchTag("VideoProcessError", () =>
              Effect.sync(() => {
                tmpVideoPath = rawConcatPath;
              }),
            ),
          );
        }
      }

      return {
        videoPath,
        tmpVideoPath,
        screenshotPaths: yield* Ref.get(savedScreenshotPathsRef),
      } satisfies CloseResult;
    });

    return {
      open,
      navigate,
      hasSession: () => Boolean(Ref.getUnsafe(sessionRef)),
      getBaseUrl: () => configuredBaseUrl,
      requirePage,
      requireSession,
      snapshot,
      annotatedScreenshot,
      updateLastSnapshot,
      saveScreenshot,
      close,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Browser.layer));
}
