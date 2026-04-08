import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { Effect, Option, type ManagedRuntime } from "effect";
import { FileSystem } from "effect/FileSystem";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { runAccessibilityAudit } from "../accessibility";
import { formatPerformanceTrace } from "../performance-trace";
import { McpSession } from "./mcp-session";
import { OverlayController } from "./overlay-controller";
import { DUPLICATE_REQUEST_WINDOW_MS, TMP_ARTIFACT_OUTPUT_DIRECTORY } from "./constants";

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const safeJsonStringify = (data: unknown): string => {
  const seen = new WeakSet();
  return JSON.stringify(
    data,
    (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    },
    2,
  );
};

const jsonResult = (data: unknown) => textResult(safeJsonStringify(data));

const imageResult = (base64: string) => ({
  content: [{ type: "image" as const, data: base64, mimeType: "image/png" }],
});

// HACK: get AsyncFunction constructor for dynamic code evaluation in playwright tool
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const buildExpectGuide = (): string =>
  [
    "You validate code changes that were just generated or modified by testing them in a real browser. Your job is to find bugs, verify correctness, audit accessibility, and measure performance before the changes are considered complete.",
    "",
    "You are the quality gate — the agent made code changes, and now you verify they actually work.",
    "",
    "<subagent_strategy>",
    "Always run browser interactions inside a subagent/sub-task. This keeps browser state (snapshots, console logs, network captures) isolated from your main conversation, improving context performance and reducing token usage.",
    "",
    "CRITICAL: The subagent MUST use the expect MCP tools (open, playwright, screenshot, console_logs, network_requests, performance_metrics, accessibility_audit, close) for all browser interactions. Do NOT use any other browser automation tools. The expect MCP server is the only way to interact with the browser.",
    "",
    "Workflow:",
    "1. Spawn a subagent for browser work. Instruct it to use ONLY the expect MCP tools listed below.",
    "2. Inside the subagent: use the expect `open` tool to launch a browser and navigate to a URL, interact using `playwright` and `screenshot`, observe with `console_logs` and `network_requests`, audit with `accessibility_audit` and `performance_metrics`, then `close`.",
    "3. Return only the relevant findings (bugs, evidence, answers) to the main context.",
    "4. One browser session per subagent. If you need to test a different engine (WebKit, Firefox), spawn a separate subagent.",
    "</subagent_strategy>",
    "",
    "<expect_mcp_tools>",
    "These are the ONLY tools you should use for browser interactions. They are provided by the expect MCP server. Do NOT use any other browser tools.",
    "",
    "1. open: launch a browser and navigate to a URL. Pass headed=true to show the browser window. Pass cookies=true to reuse local browser cookies. Pass browser='webkit' or browser='firefox' for cross-browser testing. Pass cdp='ws://...' to connect to an existing Chrome instance.",
    "2. playwright: execute Playwright code in Node.js context. Globals: page (Page), context (BrowserContext), browser (Browser), ref (function: snapshot ref ID → Locator). Use `return` to send values back. Set snapshotAfter=true to auto-snapshot after DOM-changing actions.",
    "3. screenshot: capture page state. Modes: 'snapshot' (ARIA accessibility tree with element refs — preferred for interaction), 'screenshot' (PNG image), 'annotated' (PNG with numbered labels on interactive elements). Pass fullPage=true for full scrollable content.",
    "4. console_logs: get browser console messages. Filter by type ('error', 'warning', 'log'). Pass clear=true to reset after reading.",
    "5. network_requests: get captured HTTP requests with automatic issue detection (4xx/5xx failures, duplicate requests, mixed content). Filter by method, URL, or resource type.",
    "6. performance_metrics: collect Core Web Vitals (FCP, LCP, CLS, INP), navigation timing (TTFB), Long Animation Frames (LoAF) with script attribution, and resource breakdown.",
    "7. accessibility_audit: run a WCAG accessibility audit using axe-core + IBM Equal Access. Returns violations sorted by severity with CSS selectors, HTML context, and fix guidance.",
    "8. close: close the browser and end the session. Always call this when done — it flushes the session video and screenshots to disk.",
    "</expect_mcp_tools>",
    "",
    "<snapshot_workflow>",
    "Prefer screenshot mode 'snapshot' for observing page state. Use 'screenshot' or 'annotated' only for purely visual checks.",
    "",
    "1. Call screenshot with mode='snapshot' to get the ARIA tree with refs like [ref=e4].",
    "2. Use ref() in playwright to act on elements: await ref('e3').fill('test@example.com'); await ref('e4').click();",
    "3. Take a new snapshot only when the page structure changes (navigation, modal open/close, new content loaded).",
    "4. Always snapshot first, then use ref() to act. Never guess CSS selectors when refs are available.",
    "",
    "Batch actions that do NOT change DOM structure into a single playwright call. Do NOT batch across DOM-changing boundaries (dropdown open, modal, dialog, navigation). After a DOM-changing action, take a new snapshot for fresh refs.",
    "",
    "Layered interactions (dropdowns, menus, popovers): click trigger, wait briefly, take a NEW snapshot, then click the revealed option. For native <select> elements, use ref('eN').selectOption('value') directly.",
    "",
    "Scroll-aware snapshots: snapshots only show visible elements. Hidden items appear as '- note \"N items hidden above/below\"'. To reveal hidden content, scroll using playwright: await page.evaluate(() => document.querySelector('[aria-label=\"List\"]').scrollTop += 500). Then take a new snapshot. Use fullPage=true to include all elements.",
    "</snapshot_workflow>",
    "",
    "<stability_and_recovery>",
    "- After navigation or major UI changes, wait for the page to settle: await page.waitForLoadState('networkidle').",
    "- Use event-driven waits (waitForSelector, waitForURL, waitForFunction) instead of timed delays. Take a new snapshot after each wait resolves.",
    "- When a ref stops working: take a new snapshot for fresh refs, scroll the target into view, or retry once.",
    "- Do not repeat the same failing action without new evidence (fresh snapshot, different ref, changed page state).",
    "- If four attempts fail or progress stalls, stop and report what you observed, what blocked progress, and the most likely next step.",
    "- If you encounter a hard blocker (login, passkey, captcha, permissions), stop and report it instead of improvising.",
    "</stability_and_recovery>",
    "",
    "<best_practices>",
    "- After each interaction step, call console_logs with type='error' to catch unexpected errors.",
    "- Use accessibility_audit before concluding a test session to catch WCAG violations.",
    "- Use performance_metrics to check for Core Web Vitals issues.",
    "- When testing forms, use adversarial input: Unicode (umlauts, CJK, RTL), boundary values (0, -1, 999999999), long strings (200+ chars), and XSS payloads.",
    "- For responsive testing, use page.setViewportSize() at multiple breakpoints: 375x812 (mobile), 768x1024 (tablet), 1280x800 (laptop), 1440x900 (desktop).",
    "- Assertion-first: navigate, act, then validate before moving on. Check at least two independent signals per step (e.g. URL changed AND new content appeared).",
    "</best_practices>",
  ].join("\n");

// HACK: tool annotations (readOnlyHint, destructiveHint) are required for parallel execution in the Claude Agent SDK
export const createBrowserMcpServer = <E>(
  runtime: ManagedRuntime.ManagedRuntime<McpSession | OverlayController | FileSystem, E>,
) => {
  const runMcp = <A>(
    effect: Effect.Effect<A, unknown, McpSession | OverlayController | FileSystem>,
  ) => runtime.runPromise(effect);

  const server = new McpServer({
    name: "expect",
    version: "0.0.1",
  });

  const openTool = server.registerTool(
    "open",
    {
      title: "Open URL",
      description:
        "Navigate to a URL, launching a browser if needed. Set 'cdp' to a WebSocket URL (e.g. 'ws://localhost:9222/devtools/browser/...') to connect to an already-running Chrome via CDP instead of launching a new browser.",
      inputSchema: {
        url: z.string().describe("URL to navigate to"),
        headed: z.boolean().optional().describe("Show browser window"),
        cookies: z
          .boolean()
          .optional()
          .describe("Reuse local browser cookies for the target URL when available"),
        waitUntil: z
          .enum(["load", "domcontentloaded", "networkidle", "commit"])
          .optional()
          .describe("Wait strategy"),
        cdp: z
          .string()
          .optional()
          .describe(
            "CDP WebSocket endpoint URL to connect to an existing Chrome instance (e.g. 'ws://localhost:9222/devtools/browser/...').",
          ),
        browser: z
          .enum(["chromium", "webkit", "firefox"])
          .optional()
          .describe(
            "Browser engine to launch (default: chromium). Use 'webkit' for Safari-like testing or 'firefox' for Firefox testing. CDP connections are only supported with chromium.",
          ),
      },
    },
    ({ url, headed, cookies, waitUntil, cdp, browser: browserType }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;

          if (session.hasSession()) {
            const page = yield* session.requirePage();
            yield* overlay.updateLabel(page, `Navigating to ${url}`);
            yield* session.navigate(url, { waitUntil });
            return textResult(`Navigated to ${url}`);
          }

          const result = yield* session.open(url, {
            headed,
            cookies,
            waitUntil,
            cdpUrl: Option.fromNullishOr(cdp),
            browserType,
          });
          const engineSuffix = browserType && browserType !== "chromium" ? ` [${browserType}]` : "";
          const cdpSuffix = cdp ? ` (connected via CDP: ${cdp})` : "";
          const chromeSuffix = result.isExternalBrowser ? " (live Chrome)" : "";
          return textResult(
            `Opened ${url}${engineSuffix}${cdpSuffix}${chromeSuffix}` +
              (result.injectedCookieCount > 0
                ? ` (${result.injectedCookieCount} cookies synced from local browser)`
                : ""),
          );
        }).pipe(Effect.withSpan(`mcp.tool.open`)),
      ),
  );

  const playwrightTool = server.registerTool(
    "playwright",
    {
      title: "Execute Playwright",
      description:
        "Execute Playwright code in the Node.js context. Available globals: page (Page), context (BrowserContext), browser (Browser), ref (function: ref ID from snapshot → Playwright Locator). Use `return` to send a value back as JSON. Supports await. Set snapshotAfter=true to automatically take a fresh ARIA snapshot after execution and get updated refs — useful after actions that change the DOM (opening dropdowns, dialogs, navigating).",
      inputSchema: {
        code: z.string().describe("Playwright code to execute"),
        description: z
          .string()
          .optional()
          .describe(
            "Short human-readable description of what this action does (e.g. 'Click the login button'). Shown in the overlay tooltip.",
          ),
        snapshotAfter: z
          .boolean()
          .optional()
          .describe(
            "Take a fresh ARIA snapshot after execution and return it alongside the result. Use after actions that change the DOM (dropdowns, dialogs, navigation).",
          ),
      },
    },
    ({ code, description, snapshotAfter }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          const sessionData = yield* session.requireSession();
          const cursorLabel = description ?? "Working…";

          yield* overlay.positionCursorForCode(
            sessionData.page,
            code,
            cursorLabel,
            sessionData.lastSnapshot,
          );

          const ref = (refId: string) => {
            if (!sessionData.lastSnapshot)
              throw new Error("No snapshot taken yet. Call screenshot with mode 'snapshot' first.");
            return Effect.runSync(sessionData.lastSnapshot.locator(refId));
          };

          const codeResult = yield* Effect.promise(async () => {
            try {
              const userFunction = new AsyncFunction("page", "context", "browser", "ref", code);
              const result = await userFunction(
                sessionData.page,
                sessionData.context,
                sessionData.browser,
                ref,
              );
              return { success: true as const, value: result };
            } catch (error) {
              return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          });

          yield* overlay.logAction(sessionData.page, cursorLabel, code);

          if (!codeResult.success) {
            return textResult(`Error: ${codeResult.error}`);
          }

          if (snapshotAfter) {
            const snapshotResult = yield* session.snapshot(sessionData.page);
            yield* session.updateLastSnapshot(snapshotResult);
            const resultPayload =
              codeResult.value === undefined
                ? {
                    snapshot: {
                      tree: snapshotResult.tree,
                      refs: snapshotResult.refs,
                      stats: snapshotResult.stats,
                    },
                  }
                : {
                    result: codeResult.value,
                    snapshot: {
                      tree: snapshotResult.tree,
                      refs: snapshotResult.refs,
                      stats: snapshotResult.stats,
                    },
                  };
            return jsonResult(resultPayload);
          }

          if (codeResult.value === undefined) return textResult("OK");
          return jsonResult(codeResult.value);
        }).pipe(Effect.withSpan(`mcp.tool.playwright`)),
      ),
  );

  const screenshotTool = server.registerTool(
    "screenshot",
    {
      title: "Screenshot",
      description:
        "Capture the current page state. Modes: 'screenshot' (default, PNG image), 'snapshot' (ARIA accessibility tree with element refs), 'annotated' (screenshot with numbered labels on interactive elements).",
      annotations: { readOnlyHint: true },
      inputSchema: {
        mode: z
          .enum(["screenshot", "snapshot", "annotated"])
          .optional()
          .describe("Capture mode (default: screenshot)"),
        fullPage: z
          .boolean()
          .optional()
          .describe(
            "Capture the full page. For screenshot/annotated: captures full scrollable page. For snapshot: includes all elements in scroll containers instead of only visible ones.",
          ),
      },
    },
    ({ mode, fullPage }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          const page = yield* session.requirePage();
          const resolvedMode = mode ?? "screenshot";
          yield* overlay.updateLabel(page, `Taking ${resolvedMode}`);

          if (resolvedMode === "snapshot") {
            const result = yield* overlay.withHidden(
              page,
              session.snapshot(page, { viewportAware: !fullPage }),
            );
            yield* session.updateLastSnapshot(result);
            return jsonResult({ tree: result.tree, refs: result.refs, stats: result.stats });
          }

          if (resolvedMode === "annotated") {
            const result = yield* session.annotatedScreenshot(page, { fullPage });
            yield* session.saveScreenshot(result.screenshot);
            return {
              content: [
                {
                  type: "image" as const,
                  data: result.screenshot.toString("base64"),
                  mimeType: "image/png",
                },
                {
                  type: "text" as const,
                  text: result.annotations
                    .map(
                      (annotation) =>
                        `[${annotation.label}] @${annotation.ref} ${annotation.role} "${annotation.name}"`,
                    )
                    .join("\n"),
                },
              ],
            };
          }

          const buffer = yield* overlay.withHidden(
            page,
            Effect.tryPromise(() => page.screenshot({ fullPage, scale: "css" })),
          );
          yield* session.saveScreenshot(buffer);
          return imageResult(buffer.toString("base64"));
        }).pipe(Effect.withSpan(`mcp.tool.screenshot`)),
      ),
  );

  const consoleLogsTool = server.registerTool(
    "console_logs",
    {
      title: "Console Logs",
      description:
        "Get browser console log messages. Optionally filter by log type (log, warning, error, info, debug).",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: z
          .string()
          .optional()
          .describe("Filter by console message type (e.g. 'error', 'warning', 'log')"),
        clear: z.boolean().optional().describe("Clear the collected messages after reading"),
      },
    },
    ({ type, clear }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          const sessionData = yield* session.requireSession();
          yield* overlay.updateLabel(sessionData.page, "Reading console logs");
          const entries = type
            ? sessionData.consoleMessages.filter((entry) => entry.type === type)
            : sessionData.consoleMessages;
          if (clear) sessionData.consoleMessages.length = 0;
          if (entries.length === 0) return textResult("No console messages captured.");

          const errorCount = entries.filter((entry) => entry.type === "error").length;
          const warningCount = entries.filter((entry) => entry.type === "warning").length;
          const summary =
            errorCount > 0 || warningCount > 0
              ? `${errorCount} error(s), ${warningCount} warning(s) out of ${entries.length} total messages\n\n`
              : "";

          return jsonResult({ summary: summary || undefined, messages: entries });
        }).pipe(Effect.withSpan(`mcp.tool.console_logs`)),
      ),
  );

  const networkRequestsTool = server.registerTool(
    "network_requests",
    {
      title: "Network Requests",
      description:
        "Get captured network requests with automatic issue detection. Flags failed requests (4xx/5xx), duplicate requests (same URL+method within 500ms), and mixed content (HTTP on HTTPS pages). Optionally filter by HTTP method, URL substring, or resource type.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        method: z.string().optional().describe("Filter by HTTP method (e.g. 'GET', 'POST')"),
        url: z.string().optional().describe("Filter by URL substring match"),
        resourceType: z
          .string()
          .optional()
          .describe("Filter by resource type (e.g. 'xhr', 'fetch', 'document', 'script')"),
        clear: z.boolean().optional().describe("Clear the collected requests after reading"),
      },
    },
    ({ method, url, resourceType, clear }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          const sessionData = yield* session.requireSession();
          yield* overlay.updateLabel(sessionData.page, "Checking network requests");
          const normalizedMethod = method?.toUpperCase();
          const normalizedResourceType = resourceType?.toLowerCase();
          const entries = sessionData.networkRequests.filter(
            (entry) =>
              (!normalizedMethod || entry.method === normalizedMethod) &&
              (!url || entry.url.includes(url)) &&
              (!normalizedResourceType || entry.resourceType === normalizedResourceType),
          );
          if (clear) sessionData.networkRequests.length = 0;
          if (entries.length === 0) return textResult("No network requests captured.");

          const failed = entries.filter(
            (entry) => entry.status !== undefined && entry.status >= 400,
          );

          const duplicateMap = new Map<string, { url: string; method: string; count: number }>();
          const lastTimestamp = new Map<string, number>();
          for (const entry of entries) {
            const key = `${entry.method}:${entry.url}`;
            const previous = lastTimestamp.get(key);
            if (
              previous !== undefined &&
              Math.abs(entry.timestamp - previous) < DUPLICATE_REQUEST_WINDOW_MS
            ) {
              const existing = duplicateMap.get(key);
              if (existing) {
                existing.count++;
              } else {
                duplicateMap.set(key, { url: entry.url, method: entry.method, count: 2 });
              }
            }
            lastTimestamp.set(key, entry.timestamp);
          }
          const duplicates = Array.from(duplicateMap.values());

          const isHttps = entries.some(
            (entry) => entry.resourceType === "document" && entry.url.startsWith("https://"),
          );
          const mixedContent = isHttps
            ? entries.filter(
                (entry) => entry.resourceType !== "document" && entry.url.startsWith("http://"),
              )
            : [];

          const issues = {
            failedRequests: failed.map((entry) => ({
              url: entry.url,
              method: entry.method,
              status: entry.status,
            })),
            duplicateRequests: duplicates,
            mixedContent: mixedContent.map((entry) => entry.url),
          };

          const hasIssues = failed.length > 0 || duplicates.length > 0 || mixedContent.length > 0;

          return jsonResult({
            issues: hasIssues ? issues : undefined,
            requests: entries,
          });
        }).pipe(Effect.withSpan(`mcp.tool.network_requests`)),
      ),
  );

  const performanceMetricsTool = server.registerTool(
    "performance_metrics",
    {
      title: "Performance Metrics",
      description:
        "Collect a full performance trace: Core Web Vitals (FCP, LCP, CLS, INP), navigation timing (TTFB, server timing), Long Animation Frames (LoAF) with script attribution, and resource breakdown (slowest/largest). Writes the full trace to a file and returns the path plus a summary. Read the file for detailed LoAF script attribution and resource analysis.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    () =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          const page = yield* session.requirePage();
          yield* overlay.updateLabel(page, "Collecting performance metrics");
          const trace = yield* evaluateRuntime(page, "getPerformanceTrace");

          const hasMetrics = trace.webVitals.fcp || trace.webVitals.lcp || trace.webVitals.inp;
          if (!hasMetrics && trace.longAnimationFrames.length === 0) {
            return textResult("No performance metrics available yet.");
          }

          const traceDocument = formatPerformanceTrace(trace);
          const tracePath = path.join(
            TMP_ARTIFACT_OUTPUT_DIRECTORY,
            `performance-trace-${Date.now()}.md`,
          );
          const fileSystem = yield* FileSystem;
          yield* fileSystem
            .makeDirectory(TMP_ARTIFACT_OUTPUT_DIRECTORY, { recursive: true })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logDebug("Failed to create artifact directory", { cause }),
              ),
            );
          yield* fileSystem.writeFileString(tracePath, traceDocument);

          const summary = [`Performance trace written to: ${tracePath}`, "", "Web Vitals:"];
          const { webVitals } = trace;
          if (webVitals.fcp)
            summary.push(`  FCP: ${webVitals.fcp.value}ms (${webVitals.fcp.rating})`);
          if (webVitals.lcp)
            summary.push(`  LCP: ${webVitals.lcp.value}ms (${webVitals.lcp.rating})`);
          if (webVitals.cls)
            summary.push(`  CLS: ${webVitals.cls.value} (${webVitals.cls.rating})`);
          if (webVitals.inp)
            summary.push(`  INP: ${webVitals.inp.value}ms (${webVitals.inp.rating})`);
          if (trace.navigation) {
            summary.push(`  TTFB: ${trace.navigation.ttfb}ms`);
          }
          if (trace.longAnimationFrames.length > 0) {
            summary.push(`\nLong Animation Frames: ${trace.longAnimationFrames.length} detected`);
            const worstBlocking = Math.max(
              ...trace.longAnimationFrames.map((frame) => frame.blockingDuration),
            );
            summary.push(`  Worst blocking duration: ${Math.round(worstBlocking)}ms`);
          }
          summary.push(
            `\nResources: ${trace.resources.totalCount} loaded (${Math.round(trace.resources.totalTransferSizeBytes / 1024)}KB total)`,
          );

          summary.push(`\nFull trace: ${tracePath}`);

          return textResult(summary.join("\n"));
        }).pipe(Effect.withSpan(`mcp.tool.performance_metrics`)),
      ),
  );

  const accessibilityAuditTool = server.registerTool(
    "accessibility_audit",
    {
      title: "Accessibility Audit",
      description:
        "Run a WCAG accessibility audit on the current page using two engines (axe-core + IBM Equal Access). Returns violations sorted by severity with CSS selectors, HTML context, WCAG tags, and fix guidance.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        selector: z
          .string()
          .optional()
          .describe("CSS selector to scope the audit to a specific region of the page"),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "WCAG tags to filter by (default: wcag2a, wcag2aa, wcag21a, wcag21aa). Only applies to the axe-core engine.",
          ),
      },
    },
    ({ selector, tags }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          const page = yield* session.requirePage();
          yield* overlay.updateLabel(page, "Running accessibility audit");
          const result = yield* runAccessibilityAudit(page, { selector, tags });
          if (result.violations.length === 0) {
            return textResult("No accessibility violations found.");
          }
          return jsonResult(result);
        }).pipe(Effect.withSpan(`mcp.tool.accessibility_audit`)),
      ),
  );

  const closeTool = server.registerTool(
    "close",
    {
      title: "Close Browser",
      description: "Close the browser and end the session.",
      annotations: { destructiveHint: true },
      inputSchema: {},
    },
    () =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const overlay = yield* OverlayController;
          if (session.hasSession()) {
            const page = yield* session.requirePage();
            yield* overlay.updateLabel(page, "Closing browser");
          }
          const result = yield* session.close();
          if (!result) return textResult("No browser open.");
          const lines = ["Browser closed."];
          if (result.tmpVideoPath) {
            lines.push(`Playwright video: ${result.tmpVideoPath}`);
          } else if (result.videoPath) {
            lines.push(`Playwright video: ${result.videoPath}`);
          }
          for (const screenshotPath of result.screenshotPaths) {
            lines.push(`Screenshot: ${screenshotPath}`);
          }
          return textResult(lines.join("\n"));
        }).pipe(Effect.withSpan(`mcp.tool.close`)),
      ),
  );

  server.registerPrompt(
    "run",
    {
      description:
        "Validate code changes in a real browser. Use after generating or modifying code to verify correctness, find bugs, audit accessibility, and measure performance.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildExpectGuide(),
          },
        },
      ],
    }),
  );

  const tools = {
    open: openTool,
    playwright: playwrightTool,
    screenshot: screenshotTool,
    console_logs: consoleLogsTool,
    network_requests: networkRequestsTool,
    performance_metrics: performanceMetricsTool,
    accessibility_audit: accessibilityAuditTool,
    close: closeTool,
  };

  return { server, tools };
};

export type BrowserToolMap = ReturnType<typeof createBrowserMcpServer>["tools"];

export const startBrowserMcpServer = async <E>(
  runtime: ManagedRuntime.ManagedRuntime<McpSession | OverlayController | FileSystem, E>,
) => {
  const { server } = createBrowserMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
