import { Effect, Option, Stream } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Executor, type ExecuteOptions } from "@expect/supervisor";
import { type ExecutedTestPlan, type ExecutionEvent, ChangesFor } from "@expect/shared/models";
import {
  Cookies as CookiesService,
  Browsers,
  layerLive as cookiesLayerLive,
} from "@expect/cookies";
import { ExpectConfigError, ExpectTimeoutError } from "./errors";
import { resolveUrl, buildInstruction } from "./build-instruction";
import { getGlobalConfig } from "./config";
import { layerSdk } from "./layers";
import { createTestRun } from "./test-run";
import { buildTestResult, diffEvents, extractArtifacts } from "./result-builder";
import { DEFAULT_TIMEOUT_MS, DEFAULT_AGENT_BACKEND } from "./constants";
import type { Page } from "playwright";
import type {
  TestInput,
  TestRun,
  TestResult,
  TestEvent,
  SessionConfig,
  SessionTestInput,
  ExpectSession,
  Cookie,
  BrowserName,
  Test,
} from "./types";

const normalizeTestPrompts = (tests: readonly Test[]): readonly string[] =>
  tests.map((test) => (typeof test === "string" ? test : test.prompt));

const resolveInputUrl = (input: { url?: string; page?: Page }): string => {
  const config = getGlobalConfig();

  if (input.page) {
    return input.page.url();
  }

  if (input.url !== undefined) {
    return resolveUrl(input.url, config.baseUrl);
  }

  if (config.baseUrl) {
    return config.baseUrl;
  }

  throw new ExpectConfigError(
    "No URL provided and no baseUrl configured.",
    `Expect.test({ url: "http://localhost:3000", tests: [...] })\nOr: configure({ baseUrl: "http://localhost:3000" })`,
  );
};

const validateTests = (tests: readonly Test[]): void => {
  if (tests.length === 0) {
    throw new ExpectConfigError(
      "tests array is empty.",
      `Expect.test({ url: "...", tests: ["at least one test"] })`,
    );
  }
};

const validateTestInput = (input: TestInput): void => {
  validateTests(input.tests);
  if (input.tools && input.tools.length > 0) {
    throw new ExpectConfigError(
      "Custom tools are not yet supported.",
      `Remove the tools field for now. Tool support is coming in a future release.`,
    );
  }
  if (typeof input.before === "function" && !input.page) {
    throw new ExpectConfigError(
      "Function before requires a page.",
      `Pass a Playwright Page: Expect.test({ page, before: async (page) => { ... }, tests: [...] })`,
    );
  }
  if (typeof input.after === "function" && !input.page) {
    throw new ExpectConfigError(
      "Function after requires a page.",
      `Pass a Playwright Page: Expect.test({ page, after: async (page) => { ... }, tests: [...] })`,
    );
  }
};

const validateSessionConfig = (config: SessionConfig): void => {
  if (config.browserContext) {
    throw new ExpectConfigError(
      "External browserContext is not yet supported.",
      `Remove the browserContext field. The SDK manages browser lifecycle internally.`,
    );
  }
  if (config.tools && config.tools.length > 0) {
    throw new ExpectConfigError(
      "Custom tools are not yet supported.",
      `Remove the tools field for now. Tool support is coming in a future release.`,
    );
  }
};

interface ResolvedCookies {
  readonly browserKeys: readonly string[];
  readonly explicitCookies: readonly Cookie[];
}

const isBrowserNameArray = (cookies: readonly unknown[]): cookies is readonly string[] =>
  cookies.length > 0 && typeof cookies[0] === "string";

const resolveCookies = (cookies: TestInput["cookies"]): ResolvedCookies => {
  if (cookies === undefined) return { browserKeys: [], explicitCookies: [] };
  if (cookies === true) return { browserKeys: ["chrome"], explicitCookies: [] };
  if (typeof cookies === "string") return { browserKeys: [cookies], explicitCookies: [] };
  if (Array.isArray(cookies)) {
    if (isBrowserNameArray(cookies)) {
      return { browserKeys: cookies, explicitCookies: [] };
    }
    return { browserKeys: [], explicitCookies: cookies };
  }
  return { browserKeys: [], explicitCookies: [] };
};

const buildInstructionWithActions = (
  url: string,
  tests: readonly Test[],
  before: TestInput["before"],
  beforeContext: string | undefined,
  after: TestInput["after"],
): string => {
  const prompts = normalizeTestPrompts(tests);
  let instruction = buildInstruction(url, prompts);

  if (typeof before === "string") {
    instruction = `Before: ${before}\n\n${instruction}`;
  }
  if (beforeContext) {
    instruction = `Context from before: ${beforeContext}\n\n${instruction}`;
  }
  if (typeof after === "string") {
    instruction = `${instruction}\n\nAfter: ${after}`;
  }

  return instruction;
};

interface ExecutionContext {
  readonly url: string;
  readonly startedAt: number;
  readonly eventBuffer: TestEvent[];
  readonly resolveWaiter: { current: (() => void) | undefined };
}

const executeTests = Effect.fn("Sdk.executeTests")(function* (
  executeOptions: ExecuteOptions,
  context: ExecutionContext,
) {
  yield* Effect.annotateCurrentSpan({
    url: context.url,
    isHeadless: executeOptions.isHeadless,
  });

  const executor = yield* Executor;
  let previousEvents: readonly ExecutionEvent[] = [];

  const finalExecuted = yield* executor.execute(executeOptions).pipe(
    Stream.tap((executed: ExecutedTestPlan) =>
      Effect.sync(() => {
        const newEvents = diffEvents(
          previousEvents,
          executed.events,
          executed,
          context.url,
          context.startedAt,
        );
        previousEvents = executed.events;
        for (const event of newEvents) {
          context.eventBuffer.push(event);
        }
        context.resolveWaiter.current?.();
      }),
    ),
    Stream.runLast,
    Effect.flatMap((option) =>
      Option.match(option, {
        onNone: () => Effect.fail(new ExpectTimeoutError({ timeoutMs: 0 })),
        onSome: (executed) => Effect.succeed(executed.finalizeTextBlock().synthesizeRunFinished()),
      }),
    ),
  );

  const artifacts = extractArtifacts(finalExecuted.events);
  const result = buildTestResult(finalExecuted, context.url, context.startedAt, artifacts);

  if (!context.eventBuffer.some((event) => event.type === "completed")) {
    context.eventBuffer.push({ type: "completed", result });
  }

  context.resolveWaiter.current?.();
  return result;
});

const extractCookies = Effect.fn("Sdk.extractCookies")(function* (keys: readonly string[]) {
  yield* Effect.annotateCurrentSpan({ browserKeys: keys.join(",") });

  const cookiesService = yield* CookiesService;
  const browsers = yield* Browsers;
  const allBrowsers = yield* browsers.list;

  const matchingBrowsers = allBrowsers.filter((browser) =>
    keys.some((key) => {
      if (browser._tag === "ChromiumBrowser") return browser.key === key;
      if (browser._tag === "FirefoxBrowser") return key === "firefox";
      if (browser._tag === "SafariBrowser") return key === "safari";
      return false;
    }),
  );

  const results = yield* Effect.forEach(
    matchingBrowsers,
    (browser) => cookiesService.extract(browser),
    { concurrency: "unbounded" },
  );

  return results.flat().map((cookie): Cookie => {
    const formatted = cookie.playwrightFormat;
    return { ...formatted, sameSite: formatted.sameSite ?? "Lax" };
  });
});

const createAsyncIterator = (
  eventBuffer: TestEvent[],
  resolveWaiter: { current: (() => void) | undefined },
  getFinished: () => boolean,
  getError: () => unknown,
): (() => AsyncIterableIterator<TestEvent>) => {
  return () => {
    let cursor = 0;

    return {
      async next(): Promise<IteratorResult<TestEvent>> {
        while (true) {
          if (cursor < eventBuffer.length) {
            const event = eventBuffer[cursor];
            cursor++;
            if (event.type === "completed") {
              return { done: true, value: undefined };
            }
            return { done: false, value: event };
          }

          if (getFinished()) {
            const error = getError();
            if (error) throw error;
            return { done: true, value: undefined };
          }

          await new Promise<void>((resolve) => {
            resolveWaiter.current = resolve;
          });
        }
      },

      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
};

const runExecution = (
  url: string,
  tests: readonly Test[],
  input: {
    cookies?: TestInput["cookies"];
    mode?: "headed" | "headless";
    timeout?: number;
    isRecording?: boolean;
    before?: TestInput["before"];
    after?: TestInput["after"];
    page?: Page;
  },
): { promise: Promise<TestResult>; subscribe: () => AsyncIterableIterator<TestEvent> } => {
  const config = getGlobalConfig();
  const timeoutMs = input.timeout ?? config.timeout ?? DEFAULT_TIMEOUT_MS;
  const isHeadless = (input.mode ?? config.mode ?? "headless") === "headless";
  const resolved = resolveCookies(input.cookies ?? config.cookies);
  const rootDir = config.rootDir ?? process.cwd();

  const eventBuffer: TestEvent[] = [];
  const resolveWaiter: { current: (() => void) | undefined } = { current: undefined };
  let finished = false;
  let executionError: unknown;

  const startExecution = async (): Promise<TestResult> => {
    let beforeContext: string | undefined;
    if (typeof input.before === "function" && input.page) {
      const beforeResult = await input.before(input.page);
      if (typeof beforeResult === "string") {
        beforeContext = beforeResult;
      }
    }

    const instruction = buildInstructionWithActions(
      url,
      tests,
      input.before,
      beforeContext,
      input.after,
    );

    const executeOptions: ExecuteOptions = {
      changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      instruction,
      isHeadless,
      cookieBrowserKeys: [...resolved.browserKeys],
      baseUrl: url,
    };

    const context: ExecutionContext = {
      url,
      startedAt: Date.now(),
      eventBuffer,
      resolveWaiter,
    };

    const program = executeTests(executeOptions, context).pipe(
      Effect.timeoutOrElse({
        duration: `${timeoutMs} millis`,
        onTimeout: () => Effect.fail(new ExpectTimeoutError({ timeoutMs })),
      }),
      Effect.provide(layerSdk(DEFAULT_AGENT_BACKEND, rootDir)),
      Effect.provide(NodeServices.layer),
    );

    const result = await Effect.runPromise(program);

    if (typeof input.after === "function" && input.page) {
      await input.after(input.page);
    }

    return result;
  };

  const promise = startExecution().then(
    (result) => {
      finished = true;
      resolveWaiter.current?.();
      return result;
    },
    (error) => {
      executionError = error;
      finished = true;
      resolveWaiter.current?.();
      throw error;
    },
  );

  const subscribe = createAsyncIterator(
    eventBuffer,
    resolveWaiter,
    () => finished,
    () => executionError,
  );

  return { promise, subscribe };
};

const test = (input: TestInput): TestRun => {
  validateTestInput(input);
  const url = resolveInputUrl(input);
  const { promise, subscribe } = runExecution(url, input.tests, input);
  return createTestRun({ promise, subscribe });
};

const session = (config: SessionConfig): ExpectSession => {
  validateSessionConfig(config);

  const sessionTest = (input: SessionTestInput): TestRun => {
    validateTests(input.tests);
    const testUrl = input.url ?? config.url;
    const globalCfg = getGlobalConfig();

    let resolvedUrl: string;
    if (testUrl !== undefined) {
      resolvedUrl = resolveUrl(testUrl, globalCfg.baseUrl ?? config.url);
    } else if (config.url) {
      resolvedUrl = config.url;
    } else if (globalCfg.baseUrl) {
      resolvedUrl = globalCfg.baseUrl;
    } else {
      throw new ExpectConfigError(
        "No URL provided for session test and no baseUrl configured.",
        `session.test({ url: "/page", tests: [...] })`,
      );
    }

    const { promise, subscribe } = runExecution(resolvedUrl, input.tests, {
      cookies: config.cookies,
      mode: input.mode ?? config.mode,
      timeout: input.timeout ?? config.timeout,
      isRecording: input.isRecording ?? config.isRecording,
      before: input.before,
      after: input.after,
    });

    return createTestRun({ promise, subscribe });
  };

  const close = async (): Promise<void> => {
    // HACK: browser lifecycle is managed by the executor internally for now
  };

  return {
    test: sessionTest,
    close,
    [Symbol.asyncDispose]: close,
  };
};

const cookies = (browser: true | BrowserName | BrowserName[]): Promise<Cookie[]> => {
  const keys: string[] =
    browser === true ? ["chrome"] : typeof browser === "string" ? [browser] : browser;

  return Effect.runPromise(
    Effect.scoped(extractCookies(keys)).pipe(
      Effect.provide(CookiesService.layer),
      Effect.provide(cookiesLayerLive),
      Effect.provide(NodeServices.layer),
    ),
  );
};

export const Expect = { test, session, cookies } as const;
