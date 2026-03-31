import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { Effect, type ManagedRuntime } from "effect";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { runAccessibilityAudit } from "../accessibility";
import { formatPerformanceTrace } from "../performance-trace";
import { McpSession } from "./mcp-session";
import { DEFAULT_SWIPE_DURATION_MS } from "../ios/constants";
import { autoDiscoverCdp } from "../cdp-discovery";

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

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// Tool annotations (readOnlyHint, destructiveHint) enable parallel execution in the Claude Agent SDK.
// See: https://platform.claude.com/docs/en/agent-sdk/agent-loop#parallel-tool-execution
export const createBrowserMcpServer = <E>(
  runtime: ManagedRuntime.ManagedRuntime<McpSession, E>,
) => {
  const runMcp = <A>(effect: Effect.Effect<A, unknown, McpSession>) => runtime.runPromise(effect);

  const server = new McpServer({
    name: "expect",
    version: "0.0.1",
  });

  server.registerTool(
    "open",
    {
      title: "Open URL",
      description:
        "Navigate to a URL, launching a browser if needed. Set 'device' to an iOS simulator name (e.g. 'iPhone 16 Pro') to open in Safari on an iOS Simulator via Appium. Set 'cdp' to a WebSocket URL (e.g. 'ws://localhost:9222/devtools/browser/...') to connect to an already-running Chrome via CDP instead of launching a new browser.",
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
        device: z
          .string()
          .optional()
          .describe(
            "iOS simulator device name (e.g. 'iPhone 16 Pro'). Opens Safari on iOS Simulator instead of desktop Chromium. Requires Xcode and Appium.",
          ),
        cdp: z
          .string()
          .optional()
          .describe(
            "CDP WebSocket endpoint URL to connect to an existing Chrome instance (e.g. 'ws://localhost:9222/devtools/browser/...'). Use 'auto' to auto-discover a running Chrome.",
          ),
      },
    },
    ({ url, headed, cookies, waitUntil, device, cdp }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;

          if (device) {
            if (session.hasIosSession()) {
              const ios = yield* session.requireIosSession();
              yield* ios.client.navigate(url);
              return textResult(`Navigated to ${url} on iOS Simulator`);
            }
            const result = yield* session.openIos(url, device);
            return textResult(
              `Opened ${url} on iOS Simulator (${result.device}, UDID: ${result.udid})`,
            );
          }

          if (session.hasSession()) {
            yield* session.navigate(url, { waitUntil });
            return textResult(`Navigated to ${url}`);
          }

          let cdpUrl: string | undefined;
          if (cdp === "auto") {
            cdpUrl = yield* autoDiscoverCdp();
            yield* Effect.logInfo("Auto-discovered CDP endpoint", { cdpUrl });
          } else if (cdp) {
            cdpUrl = cdp;
          }

          const result = yield* session.open(url, { headed, cookies, waitUntil, cdpUrl });
          const cdpSuffix = cdpUrl ? ` (connected via CDP: ${cdpUrl})` : "";
          return textResult(
            `Opened ${url}${cdpSuffix}` +
              (result.injectedCookieCount > 0
                ? ` (${result.injectedCookieCount} cookies synced from local browser)`
                : ""),
          );
        }),
      ),
  );

  server.registerTool(
    "playwright",
    {
      title: "Execute Playwright",
      description:
        "Execute Playwright code in the Node.js context. Available globals: page (Page), context (BrowserContext), browser (Browser), ref (function: ref ID from snapshot → Playwright Locator). Use `return` to send a value back as JSON. Supports await.",
      inputSchema: {
        code: z.string().describe("Playwright code to execute"),
      },
    },
    ({ code }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const sessionData = yield* session.requireSession();

          const ref = (refId: string) => {
            if (!sessionData.lastSnapshot)
              throw new Error("No snapshot taken yet. Call screenshot with mode 'snapshot' first.");
            return Effect.runSync(sessionData.lastSnapshot.locator(refId));
          };

          return yield* Effect.promise(async () => {
            try {
              const userFunction = new AsyncFunction("page", "context", "browser", "ref", code);
              const result = await userFunction(
                sessionData.page,
                sessionData.context,
                sessionData.browser,
                ref,
              );
              if (result === undefined) return textResult("OK");
              return jsonResult(result);
            } catch (error) {
              return textResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
            }
          });
        }),
      ),
  );

  server.registerTool(
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
        fullPage: z.boolean().optional().describe("Capture the full scrollable page"),
      },
    },
    ({ mode, fullPage }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;

          if (session.hasIosSession()) {
            const ios = yield* session.requireIosSession();
            const base64 = yield* ios.client.screenshot();
            return imageResult(base64);
          }

          const page = yield* session.requirePage();
          const resolvedMode = mode ?? "screenshot";

          if (resolvedMode === "snapshot") {
            const result = yield* session.snapshot(page);
            yield* session.updateLastSnapshot(result);
            return jsonResult({ tree: result.tree, refs: result.refs, stats: result.stats });
          }

          if (resolvedMode === "annotated") {
            const result = yield* session.annotatedScreenshot(page, { fullPage });
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

          const buffer = yield* Effect.tryPromise(() => page.screenshot({ fullPage }));
          return imageResult(buffer.toString("base64"));
        }),
      ),
  );

  server.registerTool(
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
          const sessionData = yield* session.requireSession();
          const entries = type
            ? sessionData.consoleMessages.filter((entry) => entry.type === type)
            : sessionData.consoleMessages;
          if (clear) sessionData.consoleMessages.length = 0;
          return entries.length === 0
            ? textResult("No console messages captured.")
            : jsonResult(entries);
        }),
      ),
  );

  server.registerTool(
    "network_requests",
    {
      title: "Network Requests",
      description:
        "Get captured network requests. Optionally filter by HTTP method, URL substring, or resource type (document, script, stylesheet, image, xhr, fetch, etc.).",
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
          const sessionData = yield* session.requireSession();
          const normalizedMethod = method?.toUpperCase();
          const normalizedResourceType = resourceType?.toLowerCase();
          const entries = sessionData.networkRequests.filter(
            (entry) =>
              (!normalizedMethod || entry.method === normalizedMethod) &&
              (!url || entry.url.includes(url)) &&
              (!normalizedResourceType || entry.resourceType === normalizedResourceType),
          );
          if (clear) sessionData.networkRequests.length = 0;
          return entries.length === 0
            ? textResult("No network requests captured.")
            : jsonResult(entries);
        }),
      ),
  );

  server.registerTool(
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
          const page = yield* session.requirePage();
          const trace = yield* evaluateRuntime(page, "getPerformanceTrace");

          const hasMetrics = trace.webVitals.fcp || trace.webVitals.lcp || trace.webVitals.inp;
          if (!hasMetrics && trace.longAnimationFrames.length === 0) {
            return textResult("No performance metrics available yet.");
          }

          const traceDocument = formatPerformanceTrace(trace);
          const traceDir = "/tmp/expect-replays";
          const tracePath = path.join(traceDir, `performance-trace-${Date.now()}.md`);
          yield* Effect.sync(() => {
            mkdirSync(traceDir, { recursive: true });
            writeFileSync(tracePath, traceDocument);
          });

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
        }),
      ),
  );

  server.registerTool(
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
          const page = yield* session.requirePage();
          const result = yield* runAccessibilityAudit(page, { selector, tags });
          if (result.violations.length === 0) {
            return textResult("No accessibility violations found.");
          }
          return jsonResult(result);
        }),
      ),
  );

  server.registerTool(
    "ios_devices",
    {
      title: "List iOS Devices",
      description:
        "List available iOS simulators and connected real devices. Use this to find device names for the 'open' tool's 'device' parameter.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    () =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const devices = yield* session.listIosDevices();
          if (devices.length === 0) {
            return textResult(
              "No iOS devices found. Make sure Xcode is installed with iOS simulators.",
            );
          }
          return jsonResult(devices);
        }),
      ),
  );

  server.registerTool(
    "tap",
    {
      title: "Tap (iOS)",
      description: "Perform a touch tap at the given coordinates on the iOS Simulator.",
      inputSchema: {
        x: z.number().describe("X coordinate to tap"),
        y: z.number().describe("Y coordinate to tap"),
      },
    },
    ({ x, y }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const ios = yield* session.requireIosSession();
          yield* ios.tap(x, y);
          return textResult(`Tapped at (${x}, ${y})`);
        }),
      ),
  );

  server.registerTool(
    "swipe",
    {
      title: "Swipe (iOS)",
      description:
        "Perform a swipe gesture on the iOS Simulator from start coordinates to end coordinates.",
      inputSchema: {
        startX: z.number().describe("Starting X coordinate"),
        startY: z.number().describe("Starting Y coordinate"),
        endX: z.number().describe("Ending X coordinate"),
        endY: z.number().describe("Ending Y coordinate"),
        duration: z.number().optional().describe("Swipe duration in milliseconds (default: 300)"),
      },
    },
    ({ startX, startY, endX, endY, duration }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const ios = yield* session.requireIosSession();
          yield* ios.swipe(startX, startY, endX, endY, duration ?? DEFAULT_SWIPE_DURATION_MS);
          return textResult(`Swiped from (${startX}, ${startY}) to (${endX}, ${endY})`);
        }),
      ),
  );

  server.registerTool(
    "ios_execute",
    {
      title: "Execute JavaScript (iOS)",
      description:
        "Execute JavaScript in the Safari context on the iOS Simulator. Returns the result as JSON.",
      inputSchema: {
        script: z.string().describe("JavaScript code to execute in Safari"),
      },
    },
    ({ script }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const ios = yield* session.requireIosSession();
          const result = yield* ios.client.executeScript(script);
          if (result === undefined) return textResult("OK");
          return jsonResult(result);
        }),
      ),
  );

  server.registerTool(
    "ios_source",
    {
      title: "Page Source (iOS)",
      description: "Get the HTML page source from Safari on the iOS Simulator.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    () =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const ios = yield* session.requireIosSession();
          return textResult(yield* ios.client.getPageSource());
        }),
      ),
  );

  server.registerTool(
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
          const result = yield* session.close();
          if (!result) return textResult("No browser open.");
          const lines = ["Browser closed."];
          if (result.tmpReplaySessionPath) {
            lines.push(`rrweb replay: ${result.tmpReplaySessionPath}`);
          }
          if (result.tmpReportPath) {
            lines.push(`rrweb report: ${result.tmpReportPath}`);
          }
          if (result.tmpVideoPath) {
            lines.push(`Playwright video: ${result.tmpVideoPath}`);
          } else if (result.videoPath) {
            lines.push(`Playwright video: ${result.videoPath}`);
          }
          return textResult(lines.join("\n"));
        }),
      ),
  );

  return server;
};

export const startBrowserMcpServer = async <E>(
  runtime: ManagedRuntime.ManagedRuntime<McpSession, E>,
) => {
  const server = createBrowserMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
