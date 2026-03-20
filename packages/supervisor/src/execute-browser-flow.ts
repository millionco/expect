import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";
import { Effect, Result, Stream } from "effect";
import {
  BROWSER_TEST_MODEL,
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_BROWSER_MCP_SERVER_NAME,
  EXECUTION_CONTEXT_FILE_LIMIT,
  EXECUTION_MODEL_EFFORT,
  EXECUTION_RECENT_COMMIT_LIMIT,
  REPLAY_FILE_NAME,
  RUN_DIRECTORY_PREFIX,
} from "./constants";
import { buildBrowserMcpSettings } from "./browser-mcp-config";
import { createBrowserRunReport } from "./create-browser-run-report";
import { createAgentModel } from "./create-agent-model";
import { ExecutionError } from "./errors";
import type { BrowserRunEvent } from "./events";
import { loadLearnings } from "./learnings-storage";
import {
  extractStreamSessionId,
  parseBrowserToolName,
  parseMarkerLine,
  parseTextDelta,
} from "./parse-execution-stream";
import type { ExecutionStreamContext, ExecutionStreamState } from "./parse-execution-stream";
import type { AgentProvider, ExecuteBrowserFlowOptions } from "./types";
import { detectAuthError } from "./utils/detect-auth-error";
import { resolveAgentProvider, type ResolvedAgentProvider } from "./utils/resolve-agent-provider";
import { saveBrowserImageResult } from "./utils/save-browser-image-result";
import { serializeToolResult } from "./utils/serialize-tool-result";
import { resolveLiveViewUrl } from "./utils/resolve-live-view-url";

export const buildExecutionModelSettings = (
  options: Pick<
    ExecuteBrowserFlowOptions,
    "provider" | "providerSettings" | "target" | "browserMcpServerName" | "liveViewUrl"
  > & { replayOutputPath?: string },
): AgentProviderSettings => {
  const provider = options.provider ?? DEFAULT_AGENT_PROVIDER;
  const browserMcpServerName = options.browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;

  return buildBrowserMcpSettings({
    providerSettings: {
      cwd: options.target.cwd,
      ...(provider === "claude" ? { model: BROWSER_TEST_MODEL } : {}),
      ...options.providerSettings,
      effort: EXECUTION_MODEL_EFFORT,
      tools: ["open", "playwright", "screenshot", "close"].map(
        (toolName) => `mcp__${browserMcpServerName}__${toolName}`,
      ),
    },
    browserMcpServerName,
    replayOutputPath: options.replayOutputPath,
    liveViewUrl: options.liveViewUrl,
  });
};

const formatSavedFlowGuidance = (options: ExecuteBrowserFlowOptions): string[] => {
  if (!options.savedFlow) return [];

  return [
    "Saved flow guidance:",
    "You are replaying a previously saved flow. Follow these steps as guidance, but adapt if the UI has changed.",
    `Saved flow title: ${options.savedFlow.title}`,
    `Saved flow request: ${options.savedFlow.userInstruction}`,
    "",
    ...options.savedFlow.steps.flatMap((step, index) => [
      `Step ${index + 1}: ${step.title}`,
      `Instruction: ${step.instruction}`,
      `Expected: ${step.expectedOutcome}`,
      "",
    ]),
  ];
};

const buildExecutionPrompt = (
  options: ExecuteBrowserFlowOptions & { learnings?: string },
): string => {
  const { userInstruction, target, environment, browserMcpServerName } = options;
  const mcpName = browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;
  const changedFiles = target.changedFiles.slice(0, EXECUTION_CONTEXT_FILE_LIMIT);
  const recentCommits = target.recentCommits.slice(0, EXECUTION_RECENT_COMMIT_LIMIT);
  const scopeStrategy =
    target.scope === "commit"
      ? [
          "- Start narrow and prove the selected commit's intended change works first.",
          "- Treat the selected commit and its touched files as the primary testing hypothesis.",
          "- After the primary flow, test 2-4 adjacent flows that could regress from the same change. Think about what else touches the same components, routes, or data.",
          "- For UI changes, verify related views that render the same data or share the same components.",
        ]
      : target.scope === "unstaged"
        ? [
            "- Start with the exact user-requested flow against the local in-progress changes.",
            "- After the primary flow, test related flows that exercise the same code paths — aim for 2-3 follow-ups.",
            "- Pay extra attention to partially-implemented features: check that incomplete states don't break existing behavior.",
          ]
        : target.scope === "changes"
          ? [
              "- Treat committed and uncommitted work as one body of change.",
              "- Cover the requested flow first, then the highest-risk adjacent flows.",
              "- Test 2-4 follow-up flows, prioritizing paths that share components or data with the changed files.",
              "- If the changes touch shared utilities or layouts, verify multiple pages that use them.",
            ]
          : [
              "- This is a branch-level review — be thorough. The goal is to catch regressions before merge, not to do a quick spot-check.",
              "- Cover the requested flow first, then systematically test each area affected by the changed files.",
              "- Aim for 5-8 total tested flows. Derive them from the changed files: each changed route, component, or data path should get its own verification.",
              "- Test cross-cutting concerns: if shared components, layouts, or utilities changed, verify them on multiple pages that consume them.",
              "- Include at least one negative/edge-case flow (e.g. invalid input, empty state, unauthorized access, broken link) relevant to the changes.",
              "- Do not stop after the happy path passes. The value of a branch review is catching what the developer might have missed.",
            ];

  return [
    "You are executing a browser regression test directly from repository context.",
    `You have 4 browser tools via the MCP server named "${mcpName}":`,
    "",
    "1. open — Launch a browser and navigate to a URL.",
    "2. playwright — Execute Playwright code in Node. Globals: page (Page), context (BrowserContext), browser (Browser), ref(id) (resolves a snapshot ref like 'e4' to a Playwright Locator). Supports await. Return a value to get it back as JSON.",
    "3. screenshot — Capture page state. Set mode: 'snapshot' (ARIA accessibility tree, default and preferred), 'screenshot' (PNG image), or 'annotated' (PNG with numbered labels on interactive elements).",
    "4. close — Close the browser and end the session.",
    "",
    "Strongly prefer screenshot with mode 'snapshot' for observing page state — the ARIA tree is fast, cheap, and sufficient for almost all assertions.",
    "Only use mode 'screenshot' or 'annotated' when you need to verify something purely visual (layout, colors, images) that the accessibility tree cannot capture.",
    "",
    "Snapshot-driven workflow:",
    "1. Call screenshot with mode 'snapshot' to get the ARIA tree with refs.",
    "2. Read the tree to find your target elements. Every interactive element has a ref like [ref=e4].",
    "3. Use ref() in one playwright call to perform multiple actions using the refs from the snapshot — fill forms, click buttons, wait, and return results all in one block.",
    "4. Only take a new snapshot when the page structure has changed significantly (navigation, modal open, new content loaded) and you need fresh refs.",
    "",
    "Example snapshot tree:",
    "  - navigation",
    '    - link "Home" [ref=e1]',
    '    - link "About" [ref=e2]',
    "  - main",
    '    - heading "Welcome"',
    '    - textbox "Email" [ref=e3]',
    '    - button "Submit" [ref=e4]',
    "",
    "Acting on refs — use ref() to get a Locator directly from the snapshot ref ID:",
    "  await ref('e3').fill('test@example.com');",
    "  await ref('e4').click();",
    "  await ref('e1').click();",
    "",
    "Always snapshot first, then use ref() to act. Never guess CSS selectors.",
    "",
    "Batch as many actions as possible into a single playwright call to minimize round trips:",
    "  playwright: await ref('e3').fill('test@example.com'); await ref('e5').fill('secret'); await ref('e6').click(); await page.waitForLoadState('networkidle'); return await page.innerText('.result');",
    "  playwright: await ref('e1').click(); await page.waitForURL('**/about');",
    "  playwright: return { url: page.url(), title: await page.title() };",
    "",
    "Execution strategy:",
    "- First master the primary flow the developer asked for. Verify it thoroughly before moving on.",
    "- Once the primary flow passes, test additional related flows suggested by the changed files and route context. The scope strategy below specifies how many — follow it.",
    "- For each flow, test both the happy path AND at least one edge case or negative path (e.g. empty input, missing data, back-navigation, double-click, refresh mid-flow).",
    "- Use the same browser session throughout unless the app forces you into a different path.",
    "- Execution style is assertion-first: navigate, act, validate, recover once, then fail with evidence if still blocked.",
    "- Create your own step structure while executing. Use stable sequential IDs like step-01, step-02, step-03.",
    "- Take your time. A thorough run that catches real issues is more valuable than a fast run that misses them. Do not rush to RUN_COMPLETED.",
    "",
    "Assertion depth — do not just confirm the page loaded. For each step, verify that the action produced the expected state change:",
    "- Before acting, note what should change. After acting, confirm it actually changed.",
    "- Check at least two independent signals per step (e.g. URL changed AND new content appeared, or item was added AND count updated).",
    "- Verify absence when relevant: after a delete, the item is gone; after dismissing a modal, it no longer appears in the tree.",
    "- Use playwright to return structured evidence rather than eyeballing snapshots: return { url: page.url(), title: await page.title(), visible: await ref('e5').isVisible() };",
    "- If the changed files suggest specific behavior (e.g. a validation rule, a redirect, a computed value), test that specific behavior rather than just the surrounding UI.",
    "",
    "Before and after each step, emit these exact status lines on their own lines:",
    "STEP_START|<step-id>|<step-title>",
    "STEP_DONE|<step-id>|<short-summary>",
    "ASSERTION_FAILED|<step-id>|<why-it-failed>",
    "RUN_COMPLETED|passed|<final-summary>",
    "RUN_COMPLETED|failed|<final-summary>",
    "",
    "Allowed failure categories: app-bug, env-issue, auth-blocked, missing-test-data, selector-drift, agent-misread.",
    "When a step fails, gather structured evidence before emitting ASSERTION_FAILED:",
    "- Call screenshot with mode 'snapshot' to capture the ARIA tree.",
    "- Use playwright to gather diagnostics: return { url: page.url(), title: await page.title(), text: await page.innerText('body').then(t => t.slice(0, 500)) };",
    "- Only take a visual screenshot if the failure might be layout/rendering related.",
    "- Summarize the failure category and the most important evidence inside <why-it-failed>.",
    "",
    "Stability heuristics:",
    "- After navigation or major UI changes, use playwright to wait for the page to settle (e.g. await page.waitForLoadState('networkidle')).",
    "- Use screenshot with mode 'snapshot' to inspect the accessibility tree before interactions that depend on current UI state.",
    "- Avoid interacting while the UI is visibly loading or transitioning.",
    "- Confirm you reached the expected page or route before continuing.",
    "- When waiting for page changes (navigation, content loading, animations), prefer short incremental waits (1-3 seconds) with snapshot checks in between rather than a single long wait. For example, instead of waiting 10 seconds: wait 2s, take a snapshot, check if ready, if not wait 2s more and snapshot again. This lets you proceed as soon as the page is ready.",
    "",
    "Recovery policy for each blocked step:",
    "- Take a new snapshot to re-inspect the page and get fresh refs.",
    "- Use playwright with ref() to scroll the target into view or retry the interaction once.",
    "- If still blocked, classify the blocker with one allowed failure category and include that classification in ASSERTION_FAILED.",
    "",
    "Avoid rabbit holes:",
    "- Do not repeat the same failing action more than once without new evidence such as a fresh snapshot, a different ref, a changed page state, or a clear new hypothesis.",
    "- If four attempts fail or progress stalls, stop acting and report what you observed, what blocked progress, and the most likely next step.",
    "- Prefer gathering evidence over brute force. If the page is confusing, use screenshot with mode 'snapshot', playwright for console or network diagnostics, or a visual screenshot to understand it before trying more actions.",
    "- If you encounter a blocker such as login, passkey/manual user interaction, permissions, captchas, destructive confirmations, missing data, or an unexpected state, stop and report it instead of improvising repeated actions.",
    "- Do not get stuck in wait-action-wait loops. Every retry should be justified by something newly observed.",
    "",
    "Before emitting RUN_COMPLETED, call the close tool exactly once so the browser session flushes the video to disk.",
    "",
    "Environment:",
    `- Base URL: ${environment?.baseUrl ?? "not provided"}`,
    `- Headed mode preference: ${environment?.headed === true ? "headed" : "headless or not specified"}`,
    `- Reuse browser cookies: ${environment?.cookies === true ? "yes" : "no or not specified"}`,
    "",
    "Testing target context:",
    `- Scope: ${target.scope}`,
    `- Display name: ${target.displayName}`,
    `- Current branch: ${target.branch.current}`,
    `- Main branch: ${target.branch.main ?? "unknown"}`,
    target.selectedCommit
      ? `- Selected commit: ${target.selectedCommit.shortHash} ${target.selectedCommit.subject}`
      : null,
    `- Diff stats: ${
      target.diffStats
        ? `${target.diffStats.filesChanged} files, +${target.diffStats.additions}/-${target.diffStats.deletions}`
        : "unknown"
    }`,
    "",
    "Developer request:",
    userInstruction,
    "",
    ...formatSavedFlowGuidance(options),
    "Project learnings from previous runs:",
    options.learnings?.trim() || "No learnings yet.",
    "",
    "Changed files:",
    changedFiles.length > 0
      ? changedFiles.map((file) => `- [${file.status}] ${file.path}`).join("\n")
      : "- No changed files detected",
    "",
    "Recent commits:",
    recentCommits.length > 0
      ? recentCommits.map((commit) => `- ${commit.shortHash} ${commit.subject}`).join("\n")
      : "- No recent commits available",
    "",
    "Diff preview:",
    target.diffPreview || "No diff preview available",
    "",
    "Scope strategy:",
    ...scopeStrategy,
  ].join("\n");
};

const createAsyncEventQueue = <T>() => {
  const values: T[] = [];
  const resolvers: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    push: (value: T) => {
      const resolver = resolvers.shift();
      if (resolver) {
        resolver({ value, done: false });
        return;
      }

      values.push(value);
    },
    close: () => {
      closed = true;
      for (const resolver of resolvers.splice(0)) {
        resolver({ value: undefined, done: true });
      }
    },
    async *drain() {
      for (;;) {
        if (values.length > 0) {
          const value = values.shift();
          if (value !== undefined) {
            yield value;
            continue;
          }
        }

        if (closed) return;

        const next = await new Promise<IteratorResult<T>>((resolve) => {
          resolvers.push(resolve);
        });
        if (next.done) return;
        yield next.value;
      }
    },
  };
};

const createBrowserRunEventIterable = (options: {
  target: ExecuteBrowserFlowOptions["target"];
  userInstruction: string;
  browserMcpServerName: string;
  replayOutputPath: string;
  liveViewUrl?: string;
  stream: ReadableStream<LanguageModelV3StreamPart>;
  abortController: AbortController;
}) =>
  (async function* (): AsyncGenerator<BrowserRunEvent> {
    const emittedEvents: BrowserRunEvent[] = [];
    const runStartedEvent: BrowserRunEvent = {
      type: "run-started",
      timestamp: Date.now(),
      title: options.userInstruction,
      liveViewUrl: options.liveViewUrl,
    };
    emittedEvents.push(runStartedEvent);
    yield runStartedEvent;

    const reader = options.stream.getReader();
    let streamState: ExecutionStreamState = { bufferedText: "", stepTitlesById: new Map() };
    let completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }> | null = null;
    let screenshotOutputDirectoryPath: string | undefined;
    const screenshotPaths: string[] = [];
    const streamContext: ExecutionStreamContext = {
      browserMcpServerName: options.browserMcpServerName,
    };

    try {
      for (;;) {
        const nextChunk = await reader.read();
        if (nextChunk.done) break;

        const part = nextChunk.value;

        if (part.type === "text-delta") {
          const parsedText = parseTextDelta(part.delta, streamState, streamContext);
          streamState = parsedText.nextState;
          for (const event of parsedText.events) {
            if (event.type === "run-completed") {
              completionEvent = {
                ...event,
                sessionId: streamState.sessionId,
                replaySessionPath: options.replayOutputPath,
              };
            } else {
              emittedEvents.push(event);
              yield event;
            }
          }
          continue;
        }

        if (part.type === "reasoning-delta") {
          const event: BrowserRunEvent = {
            type: "thinking",
            timestamp: Date.now(),
            text: part.delta,
          };
          emittedEvents.push(event);
          yield event;
          continue;
        }

        if (part.type === "tool-call") {
          const toolCallEvent: BrowserRunEvent = {
            type: "tool-call",
            timestamp: Date.now(),
            toolName: part.toolName,
            input: part.input,
          };
          emittedEvents.push(toolCallEvent);
          yield toolCallEvent;

          const browserAction = parseBrowserToolName(part.toolName, options.browserMcpServerName);
          if (browserAction) {
            const browserLogEvent: BrowserRunEvent = {
              type: "browser-log",
              timestamp: Date.now(),
              action: browserAction,
              message: `Called ${browserAction}`,
            };
            emittedEvents.push(browserLogEvent);
            yield browserLogEvent;
          }
          continue;
        }

        if (part.type === "tool-result") {
          const browserAction = parseBrowserToolName(part.toolName, options.browserMcpServerName);
          let result = serializeToolResult(part.result);
          if (browserAction === "screenshot") {
            const savedBrowserImageResult = saveBrowserImageResult({
              browserAction,
              outputDirectoryPath: screenshotOutputDirectoryPath,
              result,
            });

            if (savedBrowserImageResult) {
              screenshotOutputDirectoryPath = savedBrowserImageResult.outputDirectoryPath;
              screenshotPaths.push(savedBrowserImageResult.outputPath);
              result = savedBrowserImageResult.resultText;
            }
          }

          const toolResultEvent: BrowserRunEvent = {
            type: "tool-result",
            timestamp: Date.now(),
            toolName: part.toolName,
            result,
            isError: Boolean(part.isError),
          };
          emittedEvents.push(toolResultEvent);
          yield toolResultEvent;

          if (browserAction) {
            const browserLogEvent: BrowserRunEvent = {
              type: "browser-log",
              timestamp: Date.now(),
              action: browserAction,
              message: result,
            };
            emittedEvents.push(browserLogEvent);
            yield browserLogEvent;
          }
          continue;
        }

        if (part.type === "error") {
          const errorEvent: BrowserRunEvent = {
            type: "error",
            timestamp: Date.now(),
            message:
              "error" in part
                ? String((part as Record<string, unknown>).error)
                : "Agent stream error",
          };
          emittedEvents.push(errorEvent);
          yield errorEvent;
          completionEvent = {
            type: "run-completed",
            timestamp: Date.now(),
            status: "failed",
            summary: errorEvent.message,
            sessionId: streamState.sessionId,
            replaySessionPath: options.replayOutputPath,
          };
          continue;
        }
        const sessionId = extractStreamSessionId(part);
        if (sessionId) {
          streamState = {
            ...streamState,
            sessionId,
          };
        }
      }

      if (streamState.bufferedText.trim()) {
        const trailingEvent = parseMarkerLine(streamState.bufferedText.trim(), streamState);
        if (trailingEvent) {
          streamState = trailingEvent.nextState;
          for (const event of trailingEvent.events) {
            if (event.type === "run-completed") {
              completionEvent = {
                ...event,
                sessionId: streamState.sessionId,
                replaySessionPath: options.replayOutputPath,
              };
            } else {
              emittedEvents.push(event);
              yield event;
            }
          }
        }
      }

      const resolvedCompletionEvent =
        completionEvent ??
        ({
          type: "run-completed",
          timestamp: Date.now(),
          status: "passed",
          summary: "Run completed.",
          sessionId: streamState.sessionId,
          replaySessionPath: options.replayOutputPath,
        } satisfies Extract<BrowserRunEvent, { type: "run-completed" }>);

      const progressEvents = createAsyncEventQueue<BrowserRunEvent>();
      const reportPromise = createBrowserRunReport({
        target: options.target,
        userInstruction: options.userInstruction,
        events: emittedEvents,
        completionEvent: resolvedCompletionEvent,
        replaySessionPath: options.replayOutputPath,
        screenshotPaths,
        onProgress: (text) => {
          const progressEvent: BrowserRunEvent = {
            type: "text",
            timestamp: Date.now(),
            text,
          };
          emittedEvents.push(progressEvent);
          progressEvents.push(progressEvent);
        },
      }).finally(() => {
        progressEvents.close();
      });

      for await (const progressEvent of progressEvents.drain()) {
        yield progressEvent;
      }

      yield {
        ...resolvedCompletionEvent,
        report: await reportPromise,
      };
    } catch (cause) {
      throw cause instanceof ExecutionError
        ? cause
        : new ExecutionError({ stage: "stream consumption", cause });
    } finally {
      options.abortController.abort();
      try {
        await reader.cancel();
      } catch {}
    }
  })();

interface ExecutionStreamFailure {
  cause: unknown;
  authMessage?: string;
}

const preferClaudeForExecution = (resolved: ResolvedAgentProvider): AgentProvider[] => {
  if (resolved.explicit) return [resolved.provider, ...resolved.fallbackProviders];

  const allProviders = [resolved.provider, ...resolved.fallbackProviders];
  const claudeIndex = allProviders.indexOf("claude");
  if (claudeIndex <= 0) return allProviders;

  return ["claude" as AgentProvider, ...allProviders.filter((provider) => provider !== "claude")];
};

const createModelStreamResult = Effect.fn("createModelStreamResult")(function* (
  options: ExecuteBrowserFlowOptions,
  prompt: string,
  provider: NonNullable<ExecuteBrowserFlowOptions["provider"]>,
  browserMcpServerName: string,
  replayOutputPath: string,
  liveViewUrl?: string,
  abortController?: AbortController,
) {
  const model: LanguageModelV3 =
    options.model ??
    createAgentModel(
      provider,
      buildExecutionModelSettings({
        provider,
        providerSettings: options.providerSettings,
        target: options.target,
        browserMcpServerName,
        replayOutputPath,
        liveViewUrl,
      }),
    );

  return yield* Effect.tryPromise({
    try: () =>
      model.doStream({
        abortSignal: abortController?.signal,
        prompt: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    catch: (cause) =>
      ({
        cause,
        authMessage: detectAuthError(provider, cause),
      }) satisfies ExecutionStreamFailure,
  });
});

const resolveExecutionStreamResult = Effect.fn("resolveExecutionStreamResult")(function* (
  options: ExecuteBrowserFlowOptions,
  prompt: string,
  browserMcpServerName: string,
  replayOutputPath: string,
  liveViewUrl: string | undefined,
  abortController: AbortController,
) {
  if (options.model) {
    return yield* createModelStreamResult(
      options,
      prompt,
      options.provider ?? DEFAULT_AGENT_PROVIDER,
      browserMcpServerName,
      replayOutputPath,
      liveViewUrl,
      abortController,
    ).pipe(
      Effect.mapError(
        (failure) =>
          new ExecutionError({
            stage: "model streaming",
            cause: failure.authMessage ?? failure.cause,
          }),
      ),
    );
  }

  const resolvedAgentProvider = yield* resolveAgentProvider(options.provider).pipe(
    Effect.mapError((cause) => new ExecutionError({ stage: "agent selection", cause })),
  );
  const providersToTry = preferClaudeForExecution(resolvedAgentProvider);

  for (const [providerIndex, provider] of providersToTry.entries()) {
    const attempt = yield* Effect.result(
      createModelStreamResult(
        options,
        prompt,
        provider,
        browserMcpServerName,
        replayOutputPath,
        liveViewUrl,
        abortController,
      ),
    );

    if (Result.isSuccess(attempt)) {
      return attempt.success;
    }

    const isLastProvider = providerIndex === providersToTry.length - 1;

    if (
      resolvedAgentProvider.explicit ||
      attempt.failure.authMessage === undefined ||
      isLastProvider
    ) {
      return yield* new ExecutionError({
        stage: "model streaming",
        cause: attempt.failure.authMessage ?? attempt.failure.cause,
      }).asEffect();
    }
  }

  return yield* new ExecutionError({
    stage: "model streaming",
    cause: "No available execution agent could complete the request.",
  }).asEffect();
});

const buildExecutionStream = Effect.fn("executeBrowserFlow")(function* (
  options: ExecuteBrowserFlowOptions,
) {
  yield* Effect.annotateCurrentSpan({
    cwd: options.target.cwd,
    scope: options.target.scope,
  });

  const browserMcpServerName = options.browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;
  const replayOutputPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), RUN_DIRECTORY_PREFIX)),
    REPLAY_FILE_NAME,
  );
  const liveViewUrl =
    options.liveViewUrl ??
    (yield* Effect.tryPromise({
      try: () => resolveLiveViewUrl(),
      catch: (cause) => new ExecutionError({ stage: "resolve live view url", cause }),
    }).pipe(Effect.catchTag("ExecutionError", () => Effect.succeed(undefined))));
  const learnings = yield* Effect.tryPromise({
    try: () => loadLearnings(options.target.cwd),
    catch: (cause) => new ExecutionError({ stage: "load learnings", cause }),
  }).pipe(Effect.catchTag("ExecutionError", () => Effect.succeed(undefined)));
  const prompt = buildExecutionPrompt({
    ...options,
    browserMcpServerName,
    learnings,
  });
  const abortController = new AbortController();
  const streamResult = yield* resolveExecutionStreamResult(
    options,
    prompt,
    browserMcpServerName,
    replayOutputPath,
    liveViewUrl,
    abortController,
  );

  return Stream.fromAsyncIterable(
    createBrowserRunEventIterable({
      target: options.target,
      userInstruction: options.userInstruction,
      browserMcpServerName,
      replayOutputPath,
      liveViewUrl,
      stream: streamResult.stream,
      abortController,
    }),
    (cause) =>
      cause instanceof ExecutionError
        ? cause
        : new ExecutionError({ stage: "stream consumption", cause }),
  );
});

export const executeBrowserFlow = (
  options: ExecuteBrowserFlowOptions,
): Stream.Stream<BrowserRunEvent, ExecutionError> => Stream.unwrap(buildExecutionStream(options));
