import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import { Config, Effect, Layer, Option, ServiceMap } from "effect";
import { Browser } from "../browser.js";
import { NavigationError } from "../errors.js";
import type { AnnotatedScreenshotOptions, SnapshotOptions, SnapshotResult } from "../types.js";
import {
  BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME,
  BROWSER_TESTER_VIDEO_OUTPUT_ENV_NAME,
} from "./constants.js";
import { McpSessionNotOpenError } from "./errors.js";
import { startLiveViewServer, type LiveViewServer } from "./live-view-server.js";

interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: number;
}

interface NetworkEntry {
  url: string;
  method: string;
  status: number | undefined;
  resourceType: string;
  timestamp: number;
}

export interface BrowserSessionData {
  browser: PlaywrightBrowser;
  context: BrowserContext;
  page: Page;
  consoleMessages: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  videoOutputPath: string | undefined;
  savedVideoPath: string | undefined;
  trackedPages: Set<Page>;
  lastSnapshot: SnapshotResult | undefined;
}

export interface OpenOptions {
  headed?: boolean;
  cookies?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface OpenResult {
  injectedCookieCount: number;
}

export interface CloseResult {
  savedVideoPath: string | undefined;
}

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
    const videoOutputPath = yield* Config.option(
      Config.string(BROWSER_TESTER_VIDEO_OUTPUT_ENV_NAME),
    );
    const liveViewUrl = yield* Config.option(Config.string(BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME));

    let currentSession: BrowserSessionData | undefined;
    let currentLiveView: LiveViewServer | undefined;

    const requireSession = Effect.fn("McpSession.requireSession")(function* () {
      if (!currentSession) return yield* new McpSessionNotOpenError();
      return currentSession;
    });

    const requirePage = Effect.fn("McpSession.requirePage")(function* () {
      return (yield* requireSession()).page;
    });

    const navigate = Effect.fn("McpSession.navigate")(function* (
      url: string,
      options: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" } = {},
    ) {
      const sessionData = yield* requireSession();
      yield* Effect.tryPromise({
        try: () => sessionData.page.goto(url, { waitUntil: options.waitUntil ?? "load" }),
        catch: (cause) =>
          new NavigationError({
            url,
            cause: cause instanceof Error ? cause.message : String(cause),
          }),
      });
    });

    const open = Effect.fn("McpSession.open")(function* (url: string, options: OpenOptions = {}) {
      yield* Effect.annotateCurrentSpan({ url });

      const videoDir = Option.map(videoOutputPath, (path) => dirname(path));
      const pageResult = yield* browserService.createPage(url, {
        headed: options.headed,
        cookies: options.cookies,
        waitUntil: options.waitUntil,
        video: Option.match(videoDir, {
          onNone: () => undefined,
          onSome: (dir) => ({ dir }),
        }),
      });

      const sessionData: BrowserSessionData = {
        browser: pageResult.browser,
        context: pageResult.context,
        page: pageResult.page,
        consoleMessages: [],
        networkRequests: [],
        videoOutputPath: Option.getOrUndefined(videoOutputPath),
        savedVideoPath: undefined,
        trackedPages: new Set(),
        lastSnapshot: undefined,
      };
      setupPageTracking(pageResult.page, sessionData);
      currentSession = sessionData;

      if (Option.isSome(liveViewUrl) && !currentLiveView) {
        currentLiveView = yield* Effect.tryPromise(() =>
          startLiveViewServer({
            liveViewUrl: liveViewUrl.value,
            getPage: () => currentSession?.page,
          }),
        ).pipe(Effect.catchTag("UnknownError", () => Effect.succeed(undefined)));
      }

      const injectedCookieCount = yield* Effect.tryPromise(() => pageResult.context.cookies()).pipe(
        Effect.map((cookies) => cookies.length),
        Effect.catchTag("UnknownError", () => Effect.succeed(0)),
      );

      return { injectedCookieCount } as OpenResult;
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

    const close = Effect.fn("McpSession.close")(function* (outputPath?: string) {
      if (!currentSession) return undefined;

      const activeSession = currentSession;
      currentSession = undefined;

      if (currentLiveView) {
        const activeLiveView = currentLiveView;
        currentLiveView = undefined;
        yield* Effect.tryPromise(() => activeLiveView.close()).pipe(
          Effect.catchTag("UnknownError", () => Effect.void),
        );
      }

      const resolvedOutputPath = outputPath ?? activeSession.videoOutputPath;
      let savedVideoPath = activeSession.savedVideoPath;
      if (resolvedOutputPath && !savedVideoPath) {
        yield* Effect.sync(() => mkdirSync(dirname(resolvedOutputPath), { recursive: true }));
        savedVideoPath = yield* browserService
          .saveVideo(activeSession.page, resolvedOutputPath)
          .pipe(Effect.catchTag("BrowserLaunchError", () => Effect.succeed(undefined)));
      }

      yield* Effect.tryPromise(() => activeSession.browser.close()).pipe(
        Effect.catchTag("UnknownError", () => Effect.void),
      );

      return { savedVideoPath } as CloseResult;
    });

    return {
      open,
      navigate,
      hasSession: () => Boolean(currentSession),
      requirePage,
      requireSession,
      snapshot,
      annotatedScreenshot,
      updateLastSnapshot,
      close,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Browser.layer));
}
