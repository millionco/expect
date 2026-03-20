import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Config, Effect, Layer, Option, ServiceMap } from "effect";
import { Browser } from "../browser";
import { NavigationError } from "../errors";
import { collectAllEvents } from "../recorder";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { EVENT_COLLECT_INTERVAL_MS } from "../constants";
import type { AnnotatedScreenshotOptions, SnapshotOptions, SnapshotResult } from "../types";
import {
  BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME,
  BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME,
} from "./constants";
import { McpSessionNotOpenError } from "./errors";
import { startLiveViewServer, type LiveViewServer } from "./live-view-server";

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
  replayOutputPath: string | undefined;
  accumulatedReplayEvents: eventWithTime[];
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
  replaySessionPath: string | undefined;
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
    const replayOutputPath = yield* Config.option(
      Config.string(BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME),
    );
    const liveViewUrl = yield* Config.option(Config.string(BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME));

    let currentSession: BrowserSessionData | undefined;
    let currentLiveView: LiveViewServer | undefined;
    let replayCollectInterval: ReturnType<typeof setInterval> | undefined;

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

      const pageResult = yield* browserService.createPage(url, {
        headed: options.headed,
        cookies: options.cookies,
        waitUntil: options.waitUntil,
      });

      const sessionData: BrowserSessionData = {
        browser: pageResult.browser,
        context: pageResult.context,
        page: pageResult.page,
        consoleMessages: [],
        networkRequests: [],
        replayOutputPath: Option.getOrUndefined(replayOutputPath),
        accumulatedReplayEvents: [],
        trackedPages: new Set(),
        lastSnapshot: undefined,
      };
      setupPageTracking(pageResult.page, sessionData);
      currentSession = sessionData;

      yield* evaluateRuntime(pageResult.page, "startRecording").pipe(
        Effect.catchCause((cause) => Effect.logDebug("rrweb recording failed to start", { cause })),
      );

      if (Option.isSome(liveViewUrl) && !currentLiveView) {
        currentLiveView = yield* Effect.tryPromise(() =>
          startLiveViewServer({
            liveViewUrl: liveViewUrl.value,
            getPage: () => currentSession?.page,
            onEventsCollected: (events) => {
              currentSession?.accumulatedReplayEvents.push(...events);
            },
          }),
        ).pipe(Effect.catchTag("UnknownError", () => Effect.succeed(undefined)));
      }

      if (!currentLiveView) {
        replayCollectInterval = setInterval(() => {
          const page = currentSession?.page;
          if (!page || page.isClosed()) return;
          // HACK: fire-and-forget — page may close mid-collect; next poll catches up
          Effect.runPromise(evaluateRuntime(page, "getEvents"))
            .then((events) => {
              if (Array.isArray(events) && events.length > 0) {
                currentSession?.accumulatedReplayEvents.push(...(events as eventWithTime[]));
              }
            })
            .catch(() => {});
        }, EVENT_COLLECT_INTERVAL_MS);
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

    const close = Effect.fn("McpSession.close")(function* () {
      if (!currentSession) return undefined;

      const activeSession = currentSession;
      currentSession = undefined;

      if (replayCollectInterval) {
        clearInterval(replayCollectInterval);
        replayCollectInterval = undefined;
      }

      if (currentLiveView) {
        const activeLiveView = currentLiveView;
        currentLiveView = undefined;
        yield* Effect.tryPromise(() => activeLiveView.close()).pipe(
          Effect.catchTag("UnknownError", () => Effect.void),
        );
      }

      const replaySessionPath = yield* Effect.gen(function* () {
        if (!activeSession.page.isClosed()) {
          const finalEvents = yield* collectAllEvents(activeSession.page).pipe(
            Effect.catchCause(() => Effect.succeed([] as const)),
          );
          if (finalEvents.length > 0) {
            activeSession.accumulatedReplayEvents.push(...finalEvents);
          }
        }

        const resolvedReplayOutputPath = activeSession.replayOutputPath;
        if (resolvedReplayOutputPath && activeSession.accumulatedReplayEvents.length > 0) {
          yield* Effect.try({
            try: () => {
              mkdirSync(dirname(resolvedReplayOutputPath), { recursive: true });
              const ndjson =
                activeSession.accumulatedReplayEvents
                  .map((event) => JSON.stringify(event))
                  .join("\n") + "\n";
              writeFileSync(resolvedReplayOutputPath, ndjson, "utf-8");
            },
            catch: (cause) => cause,
          });
          return resolvedReplayOutputPath;
        }
        return undefined;
      }).pipe(Effect.catchCause(() => Effect.succeed(undefined)));

      yield* Effect.tryPromise(() => activeSession.browser.close()).pipe(
        Effect.catchTag("UnknownError", () => Effect.void),
      );

      return { replaySessionPath } as CloseResult;
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
