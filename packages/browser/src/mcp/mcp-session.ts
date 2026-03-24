import { basename, dirname, extname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import { Config, Effect, Fiber, Layer, Option, Ref, Schedule, ServiceMap } from "effect";
import {
  collectAllEvents,
  evaluateRecorderRuntime,
  buildReplayViewerHtml,
  makeReplayBroadcast,
  startLiveViewServer,
  EVENT_COLLECT_INTERVAL_MS,
  type eventWithTime,
  type LiveViewHandle,
  type ReplayBroadcast,
  type ViewerRunState,
} from "@expect/recorder";
import { Browser } from "../browser";
import { NavigationError } from "../errors";
import type { AnnotatedScreenshotOptions, SnapshotOptions, SnapshotResult } from "../types";
import { EXPECT_LIVE_VIEW_URL_ENV_NAME, EXPECT_REPLAY_OUTPUT_ENV_NAME } from "./constants";
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
  readonly consoleMessages: ConsoleEntry[];
  readonly networkRequests: NetworkEntry[];
  readonly replayOutputPath: string | undefined;
  readonly broadcast: ReplayBroadcast;
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

export interface CloseResult {
  readonly replaySessionPath: string | undefined;
  readonly reportPath: string | undefined;
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

const flushBroadcastToFile = (broadcast: ReplayBroadcast, outputPath: string) =>
  Effect.gen(function* () {
    const allEvents = yield* broadcast.snapshotEvents;
    if (allEvents.length === 0) return;

    const ndjson = allEvents.map((event) => JSON.stringify(event)).join("\n") + "\n";
    yield* Effect.try(() => {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, ndjson);
    });

    const runState = yield* broadcast.snapshotRunState;
    const replayFileName = basename(outputPath);
    const replayBaseName = basename(outputPath, extname(outputPath));
    const htmlReportPath = join(dirname(outputPath), `${replayBaseName}.html`);
    const reportHtml = buildReplayViewerHtml({
      title: runState ? `Test Report: ${runState.title}` : "Expect Report",
      eventsSource: { ndjsonPath: replayFileName },
      steps: runState,
    });
    yield* Effect.try(() => writeFileSync(htmlReportPath, reportHtml));

    if (runState) {
      const runStateFilePath = join(dirname(outputPath), "run-state.json");
      yield* Effect.try(() => writeFileSync(runStateFilePath, JSON.stringify(runState)));
    }
  });

export class McpSession extends ServiceMap.Service<McpSession>()("@browser/McpSession", {
  make: Effect.gen(function* () {
    const browserService = yield* Browser;
    const replayOutputPath = yield* Config.option(Config.string(EXPECT_REPLAY_OUTPUT_ENV_NAME));
    const liveViewUrl = yield* Config.option(Config.string(EXPECT_LIVE_VIEW_URL_ENV_NAME));

    const sessionRef = yield* Ref.make<BrowserSessionData | undefined>(undefined);
    const liveViewRef = yield* Ref.make<LiveViewHandle | undefined>(undefined);
    const pollingFiberRef = yield* Ref.make<Fiber.Fiber<unknown> | undefined>(undefined);
    const broadcastRef = yield* Ref.make<ReplayBroadcast | undefined>(undefined);
    const outputPathRef = yield* Ref.make<string | undefined>(undefined);

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const broadcast = yield* Ref.get(broadcastRef);
        const outputPath = yield* Ref.get(outputPathRef);
        if (!broadcast || !outputPath) return;
        yield* flushBroadcastToFile(broadcast, outputPath).pipe(
          Effect.catchCause((cause) => Effect.logDebug("Finalizer flush failed", { cause })),
        );
      }),
    );

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

    const pushStepEvent = Effect.fn("McpSession.pushStepEvent")(function* (state: ViewerRunState) {
      const broadcast = yield* Ref.get(broadcastRef);
      if (broadcast) {
        yield* broadcast.publishRunState(state);
      }
    });

    const open = Effect.fn("McpSession.open")(function* (url: string, options: OpenOptions = {}) {
      yield* Effect.annotateCurrentSpan({ url });

      const pageResult = yield* browserService.createPage(url, {
        headed: options.headed,
        cookies: options.cookies,
        waitUntil: options.waitUntil,
      });

      const broadcast = yield* makeReplayBroadcast;
      yield* Ref.set(broadcastRef, broadcast);

      const outputPath = Option.getOrUndefined(replayOutputPath);
      yield* Ref.set(outputPathRef, outputPath);
      const sessionData: BrowserSessionData = {
        browser: pageResult.browser,
        context: pageResult.context,
        page: pageResult.page,
        consoleMessages: [],
        networkRequests: [],
        replayOutputPath: outputPath,
        broadcast,
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
                return broadcast.publishEvents(events);
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

      const existingLiveView = yield* Ref.get(liveViewRef);
      if (Option.isSome(liveViewUrl) && !existingLiveView) {
        const handle = yield* startLiveViewServer(liveViewUrl.value, broadcast).pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("Live view server failed to start", { cause }).pipe(
              Effect.as(undefined),
            ),
          ),
        );
        if (handle) {
          yield* Ref.set(liveViewRef, handle);
        }
      }

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
      if (!activeSession) return undefined;

      yield* Ref.set(sessionRef, undefined);

      const pollingFiber = yield* Ref.get(pollingFiberRef);
      if (pollingFiber) {
        yield* Fiber.interrupt(pollingFiber);
        yield* Ref.set(pollingFiberRef, undefined);
      }

      if (!activeSession.page.isClosed()) {
        const finalEvents = yield* collectAllEvents(activeSession.page).pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("Failed to collect final replay events", { cause }).pipe(
              Effect.as([] as ReadonlyArray<eventWithTime>),
            ),
          ),
        );
        if (finalEvents.length > 0) {
          yield* activeSession.broadcast.publishEvents(finalEvents);
        }
      }

      const liveView = yield* Ref.get(liveViewRef);
      if (liveView) {
        yield* liveView.close.pipe(
          Effect.catchCause((cause) => Effect.logDebug("Failed to close live view", { cause })),
        );
        yield* Ref.set(liveViewRef, undefined);
      }

      yield* Effect.tryPromise(() => activeSession.browser.close()).pipe(
        Effect.catchCause((cause) => Effect.logDebug("Failed to close browser", { cause })),
      );

      const resolvedOutputPath = activeSession.replayOutputPath;
      let replaySessionPath: string | undefined;
      let reportPath: string | undefined;
      if (resolvedOutputPath) {
        replaySessionPath = resolvedOutputPath;
        reportPath = join(
          dirname(resolvedOutputPath),
          `${basename(resolvedOutputPath, extname(resolvedOutputPath))}.html`,
        );
      }

      return { replaySessionPath, reportPath } satisfies CloseResult;
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
      pushStepEvent,
      close,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Browser.layer));
}
