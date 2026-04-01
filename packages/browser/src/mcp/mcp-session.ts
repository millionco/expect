import path from "node:path";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Config, Effect, Fiber, Layer, Option, Ref, Schedule, ServiceMap } from "effect";
import type { Cookie } from "@expect/cookies";
import { FileSystem } from "effect/FileSystem";
import { Browser } from "../browser";
import { NavigationError } from "../errors";
import { collectAllEvents } from "../recorder";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { EVENT_COLLECT_INTERVAL_MS } from "../constants";
import { buildReplayViewerHtml } from "../replay-viewer";
import type {
  AnnotatedScreenshotOptions,
  BrowserEngine,
  SnapshotOptions,
  SnapshotResult,
} from "../types";
import {
  EXPECT_LIVE_VIEW_URL_ENV_NAME,
  EXPECT_COOKIE_BROWSERS_ENV_NAME,
  EXPECT_REPLAY_OUTPUT_ENV_NAME,
  EXPECT_CDP_URL_ENV_NAME,
} from "./constants";
import { McpSessionNotOpenError } from "./errors";
import { startLiveViewServer, type LiveViewHandle } from "./live-view-server";
import type { ViewerRunState } from "./viewer-events";

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
  readonly accumulatedReplayEvents: eventWithTime[];
  readonly trackedPages: Set<Page>;
  lastSnapshot: SnapshotResult | undefined;
}

export interface OpenOptions {
  headed?: boolean;
  cookies?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  cdpUrl?: string;
  browserType?: BrowserEngine;
}

export interface OpenResult {
  readonly injectedCookieCount: number;
}

export interface CloseResult {
  readonly replaySessionPath: string | undefined;
  readonly reportPath: string | undefined;
  readonly videoPath: string | undefined;
  readonly tmpReplaySessionPath: string | undefined;
  readonly tmpReportPath: string | undefined;
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
    const replayOutputPath = yield* Config.option(Config.string(EXPECT_REPLAY_OUTPUT_ENV_NAME));
    const liveViewUrl = yield* Config.option(Config.string(EXPECT_LIVE_VIEW_URL_ENV_NAME));
    const cookieBrowsersConfig = yield* Config.option(
      Config.string(EXPECT_COOKIE_BROWSERS_ENV_NAME),
    );
    const cdpUrlConfig = yield* Config.option(Config.string(EXPECT_CDP_URL_ENV_NAME));
    const defaultCdpUrl = Option.getOrUndefined(cdpUrlConfig);
    const cookieBrowserKeys = Option.match(cookieBrowsersConfig, {
      onNone: () => [] as string[],
      onSome: (value) => value.split(",").filter(Boolean),
    });
    const cookiesDisabled = cookieBrowserKeys.length === 0;

    const sessionRef = yield* Ref.make<BrowserSessionData | undefined>(undefined);
    const liveViewRef = yield* Ref.make<LiveViewHandle | undefined>(undefined);
    const pollingFiberRef = yield* Ref.make<Fiber.Fiber<unknown> | undefined>(undefined);
    const latestRunStateRef = yield* Ref.make<ViewerRunState | undefined>(undefined);
    const preExtractedCookiesRef = yield* Ref.make<Cookie[] | undefined>(undefined);
    const savedScreenshotPathsRef = yield* Ref.make<string[]>([]);

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

    if (!cookiesDisabled) {
      yield* browserService.preExtractCookies(cookieBrowserKeys).pipe(
        Effect.tap((cookies) => Ref.set(preExtractedCookiesRef, cookies)),
        Effect.tap((cookies) => Effect.logInfo("Cookies pre-extracted", { count: cookies.length })),
        Effect.catchCause((cause) => Effect.logWarning("Cookie pre-extraction failed", { cause })),
        Effect.forkDetach,
      );
    }

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
      yield* Ref.set(latestRunStateRef, state);
      const liveView = yield* Ref.get(liveViewRef);
      if (liveView) {
        liveView.pushRunState(state);
      }
    });

    const open = Effect.fn("McpSession.open")(function* (url: string, options: OpenOptions = {}) {
      yield* Effect.annotateCurrentSpan({ url });
      yield* Ref.set(savedScreenshotPathsRef, []);

      const preExtracted = options.cookies ? yield* Ref.get(preExtractedCookiesRef) : undefined;
      const cookiesOption =
        preExtracted && preExtracted.length > 0 ? preExtracted : options.cookies;
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

      const pageResult = yield* browserService.createPage(url, {
        headed: options.headed,
        cookies: cookiesOption,
        waitUntil: options.waitUntil,
        videoOutputDir,
        cdpUrl: options.cdpUrl ?? defaultCdpUrl,
        browserType: options.browserType,
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
      yield* Ref.set(sessionRef, sessionData);

      yield* evaluateRuntime(pageResult.page, "startRecording").pipe(
        Effect.catchCause((cause) => Effect.logDebug("rrweb recording failed to start", { cause })),
      );

      const existingLiveView = yield* Ref.get(liveViewRef);
      if (Option.isSome(liveViewUrl) && !existingLiveView) {
        const handle = yield* startLiveViewServer({
          liveViewUrl: liveViewUrl.value,
          getPage: () => Ref.getUnsafe(sessionRef)?.page,
          onEventsCollected: (events) => {
            Ref.getUnsafe(sessionRef)?.accumulatedReplayEvents.push(...events);
          },
        }).pipe(
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

      const hasLiveView = Boolean(yield* Ref.get(liveViewRef));
      if (!hasLiveView) {
        const pollPage = Effect.sync(() => Ref.getUnsafe(sessionRef)?.page).pipe(
          Effect.flatMap((page) => {
            if (!page || page.isClosed()) return Effect.void;
            return evaluateRuntime(page, "startRecording").pipe(
              Effect.catchCause(() => Effect.void),
              Effect.flatMap(() => evaluateRuntime(page, "getEvents")),
              Effect.tap((events) =>
                Effect.sync(() => {
                  if (Array.isArray(events) && events.length > 0) {
                    Ref.getUnsafe(sessionRef)?.accumulatedReplayEvents.push(...events);
                  }
                }),
              ),
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

      const liveView = yield* Ref.get(liveViewRef);
      if (liveView) {
        yield* liveView.close.pipe(
          Effect.catchCause((cause) => Effect.logDebug("Failed to close live view", { cause })),
        );
        yield* Ref.set(liveViewRef, undefined);
      }

      let replaySessionPath: string | undefined;
      let reportPath: string | undefined;
      let videoPath: string | undefined;
      let tmpReplaySessionPath: string | undefined;
      let tmpReportPath: string | undefined;
      let tmpVideoPath: string | undefined;
      const pageVideo = activeSession.page.video();
      const artifactBaseName = activeSession.replayOutputPath
        ? path.basename(
            activeSession.replayOutputPath,
            path.extname(activeSession.replayOutputPath),
          )
        : `session-${Date.now()}`;

      yield* Effect.gen(function* () {
        if (!activeSession.page.isClosed()) {
          const finalEvents = yield* collectAllEvents(activeSession.page).pipe(
            Effect.catchCause((cause) =>
              Effect.logDebug("Failed to collect final replay events", { cause }).pipe(
                Effect.as([] as ReadonlyArray<eventWithTime>),
              ),
            ),
          );
          if (finalEvents.length > 0) {
            activeSession.accumulatedReplayEvents.push(...finalEvents);
          }
        }

        const resolvedReplayOutputPath = activeSession.replayOutputPath;
        if (resolvedReplayOutputPath && activeSession.accumulatedReplayEvents.length > 0) {
          const ndjson =
            activeSession.accumulatedReplayEvents.map((event) => JSON.stringify(event)).join("\n") +
            "\n";

          yield* fileSystem
            .makeDirectory(path.dirname(resolvedReplayOutputPath), { recursive: true })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to create replay output directory", { cause }),
              ),
            );
          yield* fileSystem
            .writeFileString(resolvedReplayOutputPath, ndjson)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to write replay file", { cause }),
              ),
            );
          replaySessionPath = resolvedReplayOutputPath;

          const runState = yield* Ref.get(latestRunStateRef);
          const replayFileName = path.basename(resolvedReplayOutputPath);
          const replayBaseName = path.basename(
            resolvedReplayOutputPath,
            path.extname(resolvedReplayOutputPath),
          );
          const htmlReportPath = path.join(
            path.dirname(resolvedReplayOutputPath),
            `${replayBaseName}.html`,
          );
          const reportHtml = buildReplayViewerHtml({
            title: runState ? `Test Report: ${runState.title}` : "Expect Report",
            eventsSource: { ndjsonPath: replayFileName },
            steps: runState,
          });

          yield* fileSystem
            .writeFileString(htmlReportPath, reportHtml)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to write HTML report", { cause }),
              ),
            );
          reportPath = htmlReportPath;

          const ndjsonJsPath = `${resolvedReplayOutputPath}.js`;
          const ndjsonJsContent = `window.__EXPECT_REPLAY_NDJSON__ = ${JSON.stringify(ndjson)};\n`;
          yield* fileSystem
            .writeFileString(ndjsonJsPath, ndjsonJsContent)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to write ndjson.js wrapper", { cause }),
              ),
            );

          const tmpReplayPath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `${replayBaseName}.ndjson`,
          );
          const tmpReportFilePath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `${replayBaseName}.html`,
          );
          const tmpNdjsonJsPath = `${tmpReplayPath}.js`;

          yield* fileSystem
            .makeDirectory(TMP_ARTIFACT_OUTPUT_DIRECTORY, { recursive: true })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to create /tmp artifact directory", { cause }),
              ),
            );
          yield* fileSystem.copyFile(resolvedReplayOutputPath, tmpReplayPath).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                tmpReplaySessionPath = tmpReplayPath;
              }),
            ),
            Effect.catchCause((cause) =>
              Effect.logDebug("Failed to copy replay to /tmp", { cause }),
            ),
          );
          yield* fileSystem.copyFile(htmlReportPath, tmpReportFilePath).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                tmpReportPath = tmpReportFilePath;
              }),
            ),
            Effect.catchCause((cause) =>
              Effect.logDebug("Failed to copy report to /tmp", { cause }),
            ),
          );
          yield* fileSystem
            .copyFile(ndjsonJsPath, tmpNdjsonJsPath)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to copy ndjson.js to /tmp", { cause }),
              ),
            );

          const tmpLatestJsonPath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `${replayBaseName}-latest.json`,
          );
          yield* fileSystem
            .writeFileString(
              tmpLatestJsonPath,
              JSON.stringify(activeSession.accumulatedReplayEvents),
            )
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to write latest.json to /tmp", { cause }),
              ),
            );

          if (runState) {
            const tmpStepsJsonPath = path.join(
              TMP_ARTIFACT_OUTPUT_DIRECTORY,
              `${replayBaseName}-steps.json`,
            );
            yield* fileSystem
              .writeFileString(tmpStepsJsonPath, JSON.stringify(runState))
              .pipe(
                Effect.catchCause((cause) =>
                  Effect.logDebug("Failed to write steps.json to /tmp", { cause }),
                ),
              );
          }
        }
      }).pipe(
        Effect.catchCause((cause) => Effect.logDebug("Failed during close cleanup", { cause })),
      );

      yield* Effect.tryPromise(() => activeSession.browser.close()).pipe(
        Effect.catchCause((cause) => Effect.logDebug("Failed to close browser", { cause })),
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
          const tmpVideoFilePath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `${artifactBaseName}.webm`,
          );
          yield* fileSystem
            .makeDirectory(TMP_ARTIFACT_OUTPUT_DIRECTORY, { recursive: true })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to create /tmp artifact directory", { cause }),
              ),
            );
          yield* fileSystem.copyFile(videoPath, tmpVideoFilePath).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                tmpVideoPath = tmpVideoFilePath;
              }),
            ),
            Effect.catchCause((cause) =>
              Effect.logDebug("Failed to copy Playwright video to /tmp", { cause }),
            ),
          );
        }
      }

      return {
        replaySessionPath,
        reportPath,
        videoPath,
        tmpReplaySessionPath,
        tmpReportPath,
        tmpVideoPath,
        screenshotPaths: yield* Ref.get(savedScreenshotPathsRef),
      } satisfies CloseResult;
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
      saveScreenshot,
      close,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Browser.layer));
}
