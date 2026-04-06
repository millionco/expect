import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Fiber, Layer } from "effect";
import { Browser } from "../src/browser";
import { McpSession } from "../src/mcp/mcp-session";

const evaluateRuntimeMock = vi.hoisted(() => vi.fn());
const startLiveViewServerMock = vi.hoisted(() => vi.fn());

vi.mock("../src/utils/evaluate-runtime", async () => {
  const { Effect } = await import("effect");

  return {
    evaluateRuntime: (...args: ReadonlyArray<unknown>) => {
      evaluateRuntimeMock(...args);
      return Effect.void;
    },
  };
});

vi.mock("../src/mcp/live-view-server", async () => {
  const { Effect } = await import("effect");

  return {
    startLiveViewServer: (...args: ReadonlyArray<unknown>) => {
      startLiveViewServerMock(...args);
      return Effect.succeed({
        close: Effect.void,
        pushRunState: () => {},
      });
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
  readonly createPageMock: ReturnType<typeof vi.fn>;
  readonly preExtractCookiesMock: ReturnType<typeof vi.fn>;
}) =>
  Layer.succeed(Browser, {
    createPage: options.createPageMock,
    snapshot: () => Effect.die("unused"),
    act: () => Effect.die("unused"),
    annotatedScreenshot: () => Effect.die("unused"),
    waitForNavigationSettle: () => Effect.void,
    preExtractCookies: options.preExtractCookiesMock,
  });

const runSession = (browserLayer: Layer.Layer<Browser>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* McpSession;
    }).pipe(
      Effect.provide(Layer.effect(McpSession)(McpSession.make)),
      Effect.provide(browserLayer),
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

    const createPageMock = vi.fn((_url: string, options: { cookies?: unknown }) =>
      Effect.succeed({
        browser: {},
        context: {
          cookies: () =>
            Promise.resolve(Array.isArray(options.cookies) ? options.cookies : preExtractedCookies),
        },
        page: {
          on: () => {},
          isClosed: () => false,
          video: () => undefined,
        },
        cleanup: Effect.void,
        isExternalBrowser: false,
      }),
    );
    const preExtractCookiesMock = vi.fn(() => Effect.promise(() => extractionPromise));
    const session = await runSession(
      createBrowserLayer({
        createPageMock,
        preExtractCookiesMock,
      }),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const openFiber = yield* session
          .open("https://example.com", { cookies: true })
          .pipe(Effect.forkChild);

        yield* Effect.sleep("10 millis");
        expect(createPageMock).not.toHaveBeenCalled();

        resolvePreExtractedCookies(preExtractedCookies);

        const result = yield* Fiber.join(openFiber);
        expect(result.injectedCookieCount).toBe(preExtractedCookies.length);
      }),
    );

    expect(preExtractCookiesMock).toHaveBeenCalledTimes(1);
    expect(createPageMock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ cookies: preExtractedCookies }),
    );
  });

  it("reuses an empty completed pre-extraction result without passing boolean cookies", async () => {
    const createPageMock = vi.fn((_url: string, options: { cookies?: unknown }) =>
      Effect.succeed({
        browser: {},
        context: {
          cookies: () => Promise.resolve([]),
        },
        page: {
          on: () => {},
          isClosed: () => false,
          video: () => undefined,
        },
        cleanup: Effect.void,
        isExternalBrowser: false,
      }),
    );
    const preExtractCookiesMock = vi.fn(() => Effect.succeed([]));
    const session = await runSession(
      createBrowserLayer({
        createPageMock,
        preExtractCookiesMock,
      }),
    );

    await Effect.runPromise(session.open("https://example.com", { cookies: true }));

    expect(preExtractCookiesMock).toHaveBeenCalledTimes(1);
    expect(createPageMock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ cookies: [] }),
    );
  });
});
