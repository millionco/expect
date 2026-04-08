import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Fiber, Layer } from "effect";
import { Analytics } from "@expect/shared/observability";
import { Browser } from "../src/browser";
import { McpSession } from "../src/mcp/mcp-session";

const evaluateRuntimeMock = vi.hoisted(() => vi.fn());
vi.mock("../src/utils/evaluate-runtime", async () => {
  const { Effect } = await import("effect");

  return {
    evaluateRuntime: (...args: ReadonlyArray<unknown>) => {
      evaluateRuntimeMock(...args);
      return Effect.void;
    },
  };
});

const preExtractedCookies = [
  {
    name: "session",
    value: "token",
    domain: ".example.com",
    path: "/",
  },
];

const createBrowserLayer = (options: {
  readonly createPage: typeof Browser.Service.createPage;
  readonly preExtractCookies: typeof Browser.Service.preExtractCookies;
}) =>
  Layer.succeed(Browser, {
    createPage: options.createPage,
    snapshot: () => Effect.die("unused"),
    act: () => Effect.die("unused"),
    annotatedScreenshot: () => Effect.die("unused"),
    waitForNavigationSettle: () => Effect.void,
    preExtractCookies: options.preExtractCookies,
    resolveProfile: () => Effect.die("unused"),
    resolveProfilePath: () => Effect.die("unused"),
  });

const runSession = (browserLayer: Layer.Layer<Browser>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* McpSession;
    }).pipe(
      Effect.provide(Layer.effect(McpSession)(McpSession.make)),
      Effect.provide(browserLayer),
      Effect.provide(Analytics.layerDev),
      Effect.provide(NodeServices.layer),
    ),
  );

describe("McpSession cookie pre-extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXPECT_COOKIE_BROWSERS", "chrome");
    vi.stubEnv("EXPECT_LIVE_VIEW_URL", "http://127.0.0.1:3001/live");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("waits for the in-flight pre-extraction before opening", async () => {
    let resolvePreExtractedCookies!: (value: typeof preExtractedCookies) => void;
    const extractionPromise = new Promise<typeof preExtractedCookies>((resolve) => {
      resolvePreExtractedCookies = resolve;
    });

    const createPageCalls: Array<{ url: string | undefined; cookies: unknown }> = [];
    const createPage: typeof Browser.Service.createPage = (url, options = {}) => {
      createPageCalls.push({ url, cookies: options.cookies });
      return Effect.succeed({
        browser: {} as never,
        context: {
          cookies: () =>
            Promise.resolve(Array.isArray(options.cookies) ? options.cookies : preExtractedCookies),
        } as never,
        page: {
          on: () => {},
          isClosed: () => false,
          video: () => undefined,
        } as never,
        cleanup: Effect.void,
        isExternalBrowser: false,
      });
    };
    let preExtractCookiesCallCount = 0;
    const preExtractCookies: typeof Browser.Service.preExtractCookies = () => {
      preExtractCookiesCallCount++;
      return Effect.promise(() => extractionPromise).pipe(
        Effect.map((cookies) => cookies as never),
      );
    };
    const session = await runSession(
      createBrowserLayer({
        createPage,
        preExtractCookies,
      }),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const openFiber = yield* session
          .open("https://example.com", { cookies: true })
          .pipe(Effect.forkChild);

        yield* Effect.sleep("10 millis");
        expect(createPageCalls).toHaveLength(0);

        resolvePreExtractedCookies(preExtractedCookies);

        const result = yield* Fiber.join(openFiber);
        expect(result.injectedCookieCount).toBe(preExtractedCookies.length);
      }),
    );

    expect(preExtractCookiesCallCount).toBe(1);
    expect(createPageCalls).toHaveLength(1);
    expect(createPageCalls[0]).toMatchObject({
      url: "https://example.com",
      cookies: preExtractedCookies,
    });
  });

  it("reuses an empty completed pre-extraction result without passing boolean cookies", async () => {
    const createPageCalls: Array<{ url: string | undefined; cookies: unknown }> = [];
    const createPage: typeof Browser.Service.createPage = (url, options = {}) => {
      createPageCalls.push({ url, cookies: options.cookies });
      return Effect.succeed({
        browser: {} as never,
        context: {
          cookies: () => Promise.resolve([]),
        } as never,
        page: {
          on: () => {},
          isClosed: () => false,
          video: () => undefined,
        } as never,
        cleanup: Effect.void,
        isExternalBrowser: false,
      });
    };
    let preExtractCookiesCallCount = 0;
    const preExtractCookies: typeof Browser.Service.preExtractCookies = () => {
      preExtractCookiesCallCount++;
      return Effect.succeed([] as never);
    };
    const session = await runSession(
      createBrowserLayer({
        createPage,
        preExtractCookies,
      }),
    );

    await Effect.runPromise(session.open("https://example.com", { cookies: true }));

    expect(preExtractCookiesCallCount).toBe(1);
    expect(createPageCalls).toHaveLength(1);
    expect(createPageCalls[0]).toMatchObject({
      url: "https://example.com",
      cookies: [],
    });
  });
});
