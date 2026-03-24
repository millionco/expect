import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import { Effect, Fiber, Layer, Ref, Schedule, ServiceMap } from "effect";
import { evaluateRecorderRuntime, EVENT_COLLECT_INTERVAL_MS } from "@expect/recorder";
import { Browser } from "../browser";
import { NavigationError } from "../errors";
import type { AnnotatedScreenshotOptions, SnapshotOptions, SnapshotResult } from "../types";
import { McpSessionNotOpenError } from "./errors";
import { LiveViewerClient } from "./live-viewer-client";

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
  readonly consoleMessages: ConsoleEntry[];
  readonly networkRequests: NetworkEntry[];
  readonly trackedPages: Set<Page>;
  lastSnapshot: SnapshotResult | undefined;
}

export interface OpenOptions {
  headed?: boolean;
  cookies?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface OpenResult {
  readonly injectedCookieCount: number;
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
    const rpcClient = yield* LiveViewerClient;

    const sessionRef = yield* Ref.make<BrowserSessionData | undefined>(undefined);
    const pollingFiberRef = yield* Ref.make<Fiber.Fiber<unknown> | undefined>(undefined);

    const requireSession = Effect.fn("McpSession.requireSession")(function* () {
      const session = yield* Ref.get(sessionRef);
      if (!session) return yield* new McpSessionNotOpenError();
      return session;
    });

    const requirePage = Effect.fn("McpSession.requirePage")(function* () {
      return (yield* requireSession()).page;
    });

    const navigate = Effect.fn("McpSession.navigate")(function* (
      url: string,
      options: {
        waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
      } = {},
    ) {
      const sessionData = yield* requireSession();
      yield* Effect.tryPromise({
        try: () =>
          sessionData.page.goto(url, {
            waitUntil: options.waitUntil ?? "load",
          }),
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
        trackedPages: new Set(),
        lastSnapshot: undefined,
      };
      setupPageTracking(pageResult.page, sessionData);
      yield* Ref.set(sessionRef, sessionData);

      yield* evaluateRecorderRuntime(pageResult.page, "startRecording").pipe(
        Effect.catchCause((cause) => Effect.logDebug("rrweb recording failed to start", { cause })),
      );

      const pollPage = Effect.sync(() => Ref.getUnsafe(sessionRef)?.page).pipe(
        Effect.flatMap((page) => {
          if (!page || page.isClosed()) return Effect.void;
          return evaluateRecorderRuntime(page, "getEvents").pipe(
            Effect.tap((events) => {
              if (Array.isArray(events) && events.length > 0) {
                return rpcClient["liveViewer.PushRrwebEvents"]({ events });
              }
              return Effect.void;
            }),
            Effect.catchCause((cause) =>
              Effect.logDebug("Replay event collection failed", { cause }),
            ),
          );
        }),
      );

      const fiber = yield* pollPage.pipe(
        Effect.repeat(Schedule.spaced(EVENT_COLLECT_INTERVAL_MS)),
        Effect.forkDetach,
      );
      yield* Ref.set(pollingFiberRef, fiber);

      const injectedCookieCount = yield* Effect.tryPromise(() => pageResult.context.cookies()).pipe(
        Effect.map((cookies) => cookies.length),
        Effect.catchCause((cause) =>
          Effect.logDebug("Failed to count cookies", { cause }).pipe(Effect.as(0)),
        ),
      );

      return { injectedCookieCount } satisfies OpenResult;
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
      if (!activeSession) return;

      yield* Ref.set(sessionRef, undefined);

      const pollingFiber = yield* Ref.get(pollingFiberRef);
      if (pollingFiber) {
        yield* Fiber.interrupt(pollingFiber);
        yield* Ref.set(pollingFiberRef, undefined);
      }

      yield* Effect.tryPromise(() => activeSession.browser.close()).pipe(
        Effect.catchCause((cause) => Effect.logDebug("Failed to close browser", { cause })),
      );
    });

    return {
      open,
      navigate,
      hasSession: () => Boolean(Ref.getUnsafe(sessionRef)),
      requirePage,
      requireSession,
      snapshot,
      annotatedScreenshot,
      updateLastSnapshot,
      close,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Browser.layer),
    Layer.provide(LiveViewerClient.layer),
  );
}
