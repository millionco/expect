import { Browsers, Cookies, layerLive } from "@expect/cookies";
import type {
  Browser as BrowserProfile,
  Cookie,
  ExtractionError,
} from "@expect/cookies";
import { chromium } from "playwright";
import type {
  Browser as PlaywrightBrowser,
  BrowserContext,
  ConsoleMessage,
  Locator,
  Page,
  Request,
} from "playwright";
import {
  Array as Arr,
  Effect,
  FiberHandle,
  Layer,
  Option,
  PlatformError,
  Queue,
  Result,
  Schedule,
  Scope,
  ServiceMap,
  Stream,
} from "effect";
import {
  CONTENT_ROLES,
  EVENT_COLLECT_INTERVAL_MS,
  HEADLESS_CHROMIUM_ARGS,
  INTERACTIVE_ROLES,
  NAVIGATION_DETECT_DELAY_MS,
  OVERLAY_CONTAINER_ID,
  POST_NAVIGATION_SETTLE_MS,
  REF_PREFIX,
  SNAPSHOT_TIMEOUT_MS,
} from "./constants";
import {
  BrowserAlreadyOpenError,
  BrowserLaunchError,
  BrowserNotOpenError,
  NavigationError,
  PlaywrightExecutionError,
  SnapshotTimeoutError,
} from "./errors";
import {
  type Artifact,
  ConsoleLog,
  NetworkRequest,
  RrwebEvent,
} from "@expect/shared/models";
import { Artifacts } from "./artifacts";
import { collectAllEvents } from "./recorder";
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
  RefMap,
  SnapshotOptions,
  SnapshotResult,
} from "./types";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

export interface OpenOptions {
  readonly headed?: boolean;
  readonly cookies?: boolean;
  readonly waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  readonly executablePath?: string;
}

export class PlaywrightSession extends ServiceMap.Service<
  PlaywrightSession,
  {
    readonly browser: PlaywrightBrowser;
    readonly context: BrowserContext;
    readonly page: Page;
  }
>()("@browser/PlaywrightSession") {}

const withSession = <A>(
  fn: (session: PlaywrightSession["Service"]) => Promise<A>
) =>
  PlaywrightSession.use((session) =>
    Effect.tryPromise({
      try: () => fn(session),
      catch: (cause) => new BrowserLaunchError({ cause }),
    })
  );

const shouldAssignRef = (
  role: string,
  name: string,
  interactive?: boolean
): boolean => {
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (interactive) return false;
  return CONTENT_ROLES.has(role) && name.length > 0;
};

const isSiblingProfile = (
  profile: BrowserProfile,
  reference: BrowserProfile
) => {
  if (profile._tag !== reference._tag) return false;
  if (
    profile._tag === "ChromiumBrowser" &&
    reference._tag === "ChromiumBrowser"
  ) {
    return (
      profile.key === reference.key &&
      profile.profilePath !== reference.profilePath
    );
  }
  if (
    profile._tag === "FirefoxBrowser" &&
    reference._tag === "FirefoxBrowser"
  ) {
    return profile.profilePath !== reference.profilePath;
  }
  return false;
};

const appendCursorInteractiveElements = Effect.fn(
  "Playwright.appendCursorInteractive"
)(function* (
  page: Page,
  filteredLines: string[],
  refs: RefMap,
  refCount: number,
  options: SnapshotOptions
) {
  const cursorElements = yield* findCursorInteractive(page, options.selector);
  if (cursorElements.length === 0) return refCount;

  const existingNames = new Set(
    Object.values(refs).map((entry) => entry.name.toLowerCase())
  );
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
    newLines.push(
      `- clickable "${element.text}" [ref=${ref}] [${element.reason}]`
    );
  }

  if (newLines.length > 0) {
    filteredLines.push("# Cursor-interactive elements:");
    filteredLines.push(...newLines);
  }

  return refCount;
});

const injectOverlayLabels = (
  page: Page,
  labels: Array<{ label: number; x: number; y: number }>
) => evaluateRuntime(page, "injectOverlayLabels", OVERLAY_CONTAINER_ID, labels);

export interface CreateSessionOptions {
  headless: boolean;
  /** @note(rasmus): optional profile to use */
  browserProfile: Option.Option<BrowserProfile>;
  initialNavigation: Option.Option<{
    url: string;
    waitUntil?:
      | "load"
      | "domcontentloaded"
      | "networkidle"
      | "commit"
      | undefined;
  }>;
}

export class Playwright extends ServiceMap.Service<Playwright>()(
  "@browser/Playwright",
  {
    make: Effect.gen(function* () {
      const artifacts = yield* Artifacts;
      const cookies = yield* Cookies;
      const browsers = yield* Browsers;

      let session: PlaywrightSession["Service"] | undefined;

      const handle = yield* FiberHandle.make();

      const withCurrentSession = <A, E, R extends PlaywrightSession>(
        effect: Effect.Effect<A, E, R>
      ) =>
        Effect.gen(function* () {
          if (session === undefined) return yield* new BrowserNotOpenError();
          return yield* effect.pipe(
            Effect.provideService(PlaywrightSession, session)
          );
        });

      const withCreateSession =
        ({
          headless,
          browserProfile,
          initialNavigation,
        }: CreateSessionOptions) =>
        <A, E, R extends PlaywrightSession | Scope.Scope>(
          effect: Effect.Effect<A, E, R>
        ): Effect.Effect<
          A,
          | E
          | BrowserLaunchError
          | ExtractionError
          | NavigationError
          | PlatformError.PlatformError,
          Exclude<R, PlaywrightSession> | Scope.Scope
        > =>
          Effect.gen(function* () {
            if (session !== undefined) {
              return yield* effect.pipe(
                Effect.provideService(PlaywrightSession, session)
              );
            }

            const browser = yield* Effect.acquireRelease(
              Effect.tryPromise({
                try: () =>
                  chromium.launch({
                    headless: headless,
                    args: headless ? HEADLESS_CHROMIUM_ARGS : [],
                  }),
                catch: (cause) => new BrowserLaunchError({ cause }),
              }),
              (browser) =>
                Effect.tryPromise(() => browser.close()).pipe(
                  Effect.ignore({
                    message: "Failed to close browser process",
                    log: "Warn",
                  })
                )
            );

            const contextOptions: Parameters<typeof browser.newContext>[0] =
              browserProfile._tag === "Some" &&
              browserProfile.value._tag === "ChromiumBrowser"
                ? { locale: browserProfile.value.locale }
                : {};

            const context = yield* Effect.tryPromise({
              try: () => browser.newContext(contextOptions),
              catch: (cause) => new BrowserLaunchError({ cause }),
            });
            yield* Effect.tryPromise({
              try: () => context.addInitScript(RUNTIME_SCRIPT),
              catch: (cause) => new BrowserLaunchError({ cause }),
            });

            /** cookies */
            console.error(
              "BROWSER PROFIEL ",
              JSON.stringify(browserProfile, null, 2)
            );
            if (Option.isSome(browserProfile)) {
              const extractedCookies = yield* cookies.extract(
                browserProfile.value
              );
              console.error(
                "EXTRACTED COOKIES",
                JSON.stringify(extractedCookies, null, 2)
              );
              console.error("INSERTING COOKIES");
              yield* Effect.tryPromise({
                try: () =>
                  context.addCookies(
                    extractedCookies.map((cookie) => cookie.playwrightFormat)
                  ),
                catch: (cause) => new BrowserLaunchError({ cause }),
              });
            }

            yield* Effect.tryPromise({
              try: () => context.addInitScript(RUNTIME_SCRIPT),
              catch: (cause) => new BrowserLaunchError({ cause }),
            });

            const page = yield* Effect.tryPromise({
              try: () => context.newPage(),
              catch: (cause) => new BrowserLaunchError({ cause }),
            });

            if (Option.isSome(initialNavigation)) {
              yield* Effect.tryPromise({
                try: () =>
                  page.goto(initialNavigation.value.url, {
                    waitUntil: initialNavigation.value.waitUntil ?? "load",
                  }),
                catch: (cause) =>
                  new NavigationError({
                    url: initialNavigation.value.url,
                    cause,
                  }),
              });
            }

            session = { browser, context, page };
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                session = undefined;
              })
            );

            return yield* effect.pipe(
              Effect.provideService(PlaywrightSession, session)
            );
          });

      // The entire browser session as a single scoped effect.
      // Launched via FiberHandle — interrupting the handle triggers the finalizer
      // which collects final rrweb events and closes the browser.
      const runSession = Effect.fn("Playwright.runSession")(
        function* (options: CreateSessionOptions) {
          const { page } = yield* PlaywrightSession;

          // Page event stream — console logs and network requests from Playwright callbacks
          const pageEvents = Stream.callback<Artifact>((queue) =>
            Effect.gen(function* () {
              const onConsole = (message: ConsoleMessage) => {
                Queue.offerUnsafe(
                  queue,
                  new ConsoleLog({
                    type: message.type(),
                    text: message.text(),
                    timestamp: Date.now(),
                  })
                );
              };

              const onRequest = (request: Request) => {
                Queue.offerUnsafe(
                  queue,
                  new NetworkRequest({
                    url: request.url(),
                    method: request.method(),
                    status: undefined,
                    resourceType: request.resourceType(),
                    timestamp: Date.now(),
                  })
                );
              };

              page.on("console", onConsole);
              page.on("request", onRequest);

              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  page.off("console", onConsole);
                  page.off("request", onRequest);
                })
              );
            })
          );

          // Start rrweb recording
          yield* evaluateRuntime(page, "startRecording");
          yield* Effect.addFinalizer(() =>
            evaluateRuntime(page, "stopRecording").pipe(
              Effect.ignore({
                log: "Warn",
                message: `Rrweb recording stopping failed`,
              })
            )
          );

          // rrweb polling stream — drains buffered events from the page runtime.
          // Survives navigation — evaluate can fail transiently when the execution
          // context is destroyed mid-navigation, so errors return an empty batch.
          const pollOnce = Effect.gen(function* () {
            if (page.isClosed()) return [];
            const events = yield* evaluateRuntime(page, "getEvents");
            return events.map((event) => new RrwebEvent({ event }));
          }).pipe(Effect.catch(() => Effect.succeed([])));

          const rrwebEvents = Stream.fromEffectSchedule(
            pollOnce,
            Schedule.spaced(EVENT_COLLECT_INTERVAL_MS)
          ).pipe(Stream.flatMap((batch) => Stream.fromIterable(batch)));

          // Merge both streams and push all artifacts until interrupted
          yield* Stream.merge(pageEvents, rrwebEvents).pipe(
            Stream.tap((artifact) => artifacts.push(artifact)),
            Stream.runDrain
          );
        },
        (effect, options) => withCreateSession(options)(effect),
        Effect.tapCause((cause) =>
          Effect.logError(`Running session failed`, cause)
        ),
        Effect.annotateLogs({ fiber: "runSession" }),
        Effect.scoped
      );

      const open = Effect.fn("Playwright.open")(function* (
        options: CreateSessionOptions
      ) {
        if (session) return yield* new BrowserAlreadyOpenError();
        yield* runSession(options).pipe(FiberHandle.run(handle));
        return yield* Effect.suspend(() =>
          session
            ? Effect.succeed(session)
            : Effect.fail(new BrowserNotOpenError())
        ).pipe(
          Effect.retry({ schedule: Schedule.spaced("100 millis") }),
          Effect.timeout("5 seconds")
        );
      });

      const close = Effect.fn("Playwright.close")(function* () {
        yield* FiberHandle.clear(handle);
      }, Effect.scoped);

      const navigate = Effect.fn("Playwright.navigate")(function* (
        url: string,
        options: {
          waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
        } = {}
      ) {
        const { page } = yield* PlaywrightSession;
        yield* Effect.tryPromise({
          try: () => page.goto(url, { waitUntil: options.waitUntil ?? "load" }),
          catch: (cause) =>
            new NavigationError({
              url,
              cause: cause instanceof Error ? cause.message : String(cause),
            }),
        });
      }, withCurrentSession);

      /*

      export const scoped = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
        withFiber((fiber) => {
          const prev = fiber.services
          const scope = scopeMakeUnsafe()
          fiber.setServices(ServiceMap.add(fiber.services, scopeTag, scope))
          return onExitPrimitive(self, (exit) => {
            fiber.setServices(prev)
            return scopeCloseUnsafe(scope, exit)
          })
        }) as any


        export const scoped: <A, E, R>(
          self: Effect<A, E, R>
        ) => Effect<A, E, Exclude<R, Scope>> = internal.scoped
      */

      const snapshot = Effect.fn("Playwright.snapshot")(function* (
        options: SnapshotOptions
      ) {
        const { page } = yield* PlaywrightSession;
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
          if (
            options.maxDepth !== undefined &&
            getIndentLevel(line) > options.maxDepth
          )
            continue;

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
            options
          );
        }

        resolveNthDuplicates(refs);

        let tree = filteredLines.join("\n");
        if (options.interactive && refCount === 0)
          tree = "(no interactive elements)";
        if (options.compact) tree = compactTree(tree);

        const stats = computeSnapshotStats(tree, refs);

        return {
          tree,
          refs,
          stats,
          locator: createLocator(page, refs),
        } satisfies SnapshotResult;
      },
      withCurrentSession);

      const act = Effect.fn("Playwright.act")(function* (
        ref: string,
        action: (locator: Locator) => Promise<void>,
        options?: SnapshotOptions
      ) {
        yield* Effect.annotateCurrentSpan({ ref });
        const before = yield* snapshot(options ?? {});
        const locator = yield* before.locator(ref);
        yield* Effect.tryPromise({
          try: () => action(locator),
          catch: (error) => toActionError(error, ref),
        });
        return yield* snapshot(options ?? {});
      },
      withCurrentSession);

      const annotatedScreenshot = Effect.fn("Playwright.annotatedScreenshot")(
        function* (options: AnnotatedScreenshotOptions) {
          const { page } = yield* PlaywrightSession;
          const snapshotResult = yield* snapshot(options);
          const annotations: Annotation[] = [];
          const labelPositions: Array<{ label: number; x: number; y: number }> =
            [];

          let labelCounter = 0;

          for (const [ref, entry] of Object.entries(snapshotResult.refs)) {
            const locator = yield* snapshotResult.locator(ref);
            const box = yield* Effect.tryPromise(() =>
              locator.boundingBox()
            ).pipe(
              Effect.catchTag("UnknownError", () => Effect.succeed(undefined))
            );
            if (!box) continue;

            labelCounter++;
            annotations.push({
              label: labelCounter,
              ref,
              role: entry.role,
              name: entry.name,
            });
            labelPositions.push({ label: labelCounter, x: box.x, y: box.y });
          }

          yield* injectOverlayLabels(page, labelPositions);
          return yield* Effect.ensuring(
            withSession(({ page }) =>
              page.screenshot({ fullPage: options.fullPage })
            ).pipe(
              Effect.map((screenshotBuffer) => ({
                screenshot: screenshotBuffer,
                annotations,
              }))
            ),
            // HACK: overlay removal is best-effort — evaluateRuntime uses Effect.promise which defects on failure
            evaluateRuntime(page, "removeOverlay", OVERLAY_CONTAINER_ID).pipe(
              Effect.catchCause(() => Effect.void)
            )
          );
        },
        withCurrentSession
      );

      const waitForNavigationSettle = Effect.fn(
        "Playwright.waitForNavigationSettle"
      )(function* (urlBefore: string) {
        const { page } = yield* PlaywrightSession;
        yield* withSession(({ page }) =>
          page.waitForURL((url) => url.toString() !== urlBefore, {
            timeout: NAVIGATION_DETECT_DELAY_MS,
            waitUntil: "commit",
          })
        ).pipe(Effect.catchTag("BrowserLaunchError", () => Effect.void));
        if (page.url() !== urlBefore) {
          yield* Effect.tryPromise(() =>
            page.waitForLoadState("domcontentloaded")
          ).pipe(Effect.catchTag("UnknownError", () => Effect.void));
          yield* withSession(({ page }) =>
            page.waitForTimeout(POST_NAVIGATION_SETTLE_MS)
          );
        }
      }, withCurrentSession);

      const execute = Effect.fn("Playwright.execute")(function* (
        code: string,
        snapshot: SnapshotResult
      ) {
        const { page } = yield* PlaywrightSession;
        const ref = (refId: string) => Effect.runSync(snapshot.locator(refId));
        return yield* Effect.tryPromise({
          try: async () => {
            const userFunction = new AsyncFunction(
              "page",
              "context",
              "browser",
              "ref",
              code
            );
            const result = await userFunction(
              page,
              page.context(),
              page.context().browser(),
              ref
            );
            if (result === undefined) return "OK";
            return result;
          },
          catch: (cause) => new PlaywrightExecutionError({ cause }),
        });
      },
      withCurrentSession);

      const getPage = PlaywrightSession.use(({ page }) =>
        Effect.succeed(page)
      ).pipe(withCurrentSession);

      return {
        open,
        close,
        navigate,
        snapshot,
        act,
        annotatedScreenshot,
        waitForNavigationSettle,
        hasSession: () => Boolean(session),
        withCurrentSession,
        getPage,
        execute,
      } as const;
    }),
  }
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(Cookies.layer),
    Layer.provide(layerLive)
  );
}
