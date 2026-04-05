import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod/v4";
import { Config, Effect, Layer, Option, Schema, ServiceMap } from "effect";
import { BrowserJson } from "@expect/cookies";
import { PerformanceTrace } from "@expect/shared/models";
import type { ConsoleLog, NetworkRequest } from "@expect/shared/models";
import {
  DUPLICATE_REQUEST_WINDOW_MS,
  EXPECT_BROWSER_PROFILE_ENV_NAME,
  EXPECT_HEADED_ENV_NAME,
} from "./mcp/constants";

import { Playwright, PlaywrightSession } from "./playwright";
import { Artifacts } from "./artifacts";
import { McpServerStartError, NoSnapshotError } from "./errors";
import { evaluateRuntime } from "./utils/evaluate-runtime";
import type { SnapshotResult } from "./types";
import { autoDiscoverCdp } from "./cdp-discovery";
import { hasStringMessage } from "@expect/shared/utils";
import { formatPerformanceTrace } from "./performance-trace";

export const McpTransport = ServiceMap.Reference<Transport>("@browser/McpTransport", {
  defaultValue: () => new StdioServerTransport(),
});

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

const errorResult = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: hasStringMessage(error) ? error.message : String(error),
    },
  ],
  isError: true as const,
});

const decodeBrowserProfile = Schema.decodeEffect(BrowserJson);

export const layerMcpServer = Layer.effectDiscard(
  Effect.gen(function* () {
    const services = yield* Effect.services<Playwright | Artifacts>();
    const runRaw = Effect.runPromiseWith(services);
    const run = <A, E, R extends Artifacts | Playwright>(
      effect: Effect.Effect<A, E, R>,
      options: {
        signal?: AbortSignal;
        method: string;
        attributes?: Record<string, unknown>;
      },
    ) =>
      runRaw(
        effect.pipe(
          Effect.tapCause((cause) =>
            Effect.logError(`An error occurred in ${options.method}`, cause),
          ),
          Effect.annotateLogs({ method: `McpServer.${options?.method}` }),
          Effect.withSpan(`McpServer.${options.method}`, {
            attributes: options.attributes,
          }),
        ),
        options,
      ).catch((error) => errorResult(error));

    const browserProfileJson = yield* Config.string(EXPECT_BROWSER_PROFILE_ENV_NAME).pipe(
      Config.option,
    );

    const browserProfile = yield* Option.match(browserProfileJson, {
      onNone: () => Effect.succeedNone,
      onSome: (json) => decodeBrowserProfile(json).pipe(Effect.map(Option.some), Effect.orDie),
    });

    Config.boolean();

    const forceHeaded = yield* Config.boolean(EXPECT_HEADED_ENV_NAME).pipe(
      Config.withDefault(false),
    );

    const server = new McpServer({ name: "expect", version: "0.0.1" });

    let lastSnapshot: SnapshotResult | undefined;

    // open
    server.registerTool(
      "open",
      {
        title: "Open URL",
        description: "Navigate to a URL, launching a browser if needed.",
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
              "CDP WebSocket endpoint URL to connect to an existing Chrome instance (e.g. 'ws://localhost:9222/devtools/browser/...'). Use 'auto' to auto-discover a running Chrome.",
            ),
          browser: z
            .enum(["chromium", "webkit", "firefox"])
            .optional()
            .describe("Browser engine to launch (default: chromium)."),
        },
      },
      ({ url, headed, cookies, waitUntil, cdp, browser: browserOverride }, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (pw.hasSession()) {
            yield* pw.navigate(url, { waitUntil });
            return textResult(`Navigated to ${url}`);
          }

          yield* pw.open({
            headless: forceHeaded ? false : !headed,
            browserOverride,
            browserProfile,
            initialNavigation: Option.some({
              url,
              waitUntil,
            }),
            cdpUrl:
              cdp === "auto"
                ? yield* autoDiscoverCdp().pipe(Effect.option)
                : Option.fromNullishOr(cdp),
          });
          const browserSuffix = browserOverride ? ` [${browserOverride}]` : "";
          return textResult(`Opened ${url}${browserSuffix}`);
        }).pipe((effect) =>
          run(effect, {
            signal,
            method: "open",
            attributes: { url, headed, waitUntil, cdp },
          }),
        ),
    );

    // screenshot
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
      ({ mode, fullPage }, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          const resolvedMode = mode ?? "screenshot";

          if (resolvedMode === "snapshot") {
            const result = yield* pw.snapshot({});
            lastSnapshot = result;
            return jsonResult({
              tree: result.tree,
              refs: result.refs,
              stats: result.stats,
            });
          }

          if (resolvedMode === "annotated") {
            const result = yield* pw.annotatedScreenshot({ fullPage });
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

          const page = yield* pw.getPage;
          const buffer = yield* Effect.tryPromise(() => page.screenshot({ fullPage }));
          return imageResult(buffer.toString("base64"));
        }).pipe((effect) =>
          run(effect, {
            signal,
            method: "screenshot",
            attributes: { mode, fullPage },
          }),
        ),
    );

    // playwright — raw code execution
    server.registerTool(
      "playwright",
      {
        title: "Execute Playwright",
        description:
          "Execute Playwright code in the Node.js context. Available globals: page (Page), context (BrowserContext), browser (Browser), ref (function: ref ID from snapshot → Playwright Locator). Use `return` to send a value back as JSON. Supports await. Set snapshotAfter=true to automatically take a fresh ARIA snapshot after execution.",
        inputSchema: {
          code: z.string().describe("Playwright code to execute"),
          snapshotAfter: z
            .boolean()
            .optional()
            .describe("Take a fresh snapshot after execution and return it alongside the result"),
        },
      },
      ({ code, snapshotAfter }, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (!lastSnapshot) return yield* new NoSnapshotError();
          const result = yield* pw.execute(code, lastSnapshot);

          if (!snapshotAfter) {
            if (result === undefined) return textResult("OK");
            return jsonResult(result);
          }

          const fresh = yield* pw.snapshot({});
          lastSnapshot = fresh;
          const snapshot = {
            tree: fresh.tree,
            refs: fresh.refs,
            stats: fresh.stats,
          };
          return jsonResult(result === undefined ? { snapshot } : { result, snapshot });
        }).pipe((effect) => run(effect, { signal, method: "playwright" })),
    );

    // console_logs
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
        },
      },
      ({ type }, { signal }) =>
        Effect.gen(function* () {
          const artifacts = yield* Artifacts;
          const logs = artifacts
            .all()
            .filter((entry): entry is ConsoleLog => entry._tag === "ConsoleLog");
          const filtered = type ? logs.filter((entry) => entry.type === type) : logs;
          return filtered.length === 0
            ? textResult("No console messages captured.")
            : jsonResult(filtered);
        }).pipe((effect) => run(effect, { signal, method: "console_logs", attributes: { type } })),
    );

    // network_requests
    server.registerTool(
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
      ({ method, url, resourceType, clear }, { signal }) =>
        Effect.gen(function* () {
          const artifacts = yield* Artifacts;
          const allRequests = artifacts
            .all()
            .filter((entry): entry is NetworkRequest => entry._tag === "NetworkRequest");

          const normalizedMethod = method?.toUpperCase();
          const normalizedResourceType = resourceType?.toLowerCase();
          const entries = allRequests.filter(
            (entry) =>
              (!normalizedMethod || entry.method === normalizedMethod) &&
              (!url || entry.url.includes(url)) &&
              (!normalizedResourceType || entry.resourceType === normalizedResourceType),
          );

          if (clear) artifacts.clear();
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
                duplicateMap.set(key, {
                  url: entry.url,
                  method: entry.method,
                  count: 2,
                });
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
        }).pipe((effect) =>
          run(effect, {
            signal,
            method: "network_requests",
            attributes: { method, url, resourceType },
          }),
        ),
    );

    // performance_metrics
    server.registerTool(
      "performance_metrics",
      {
        title: "Performance Metrics",
        description:
          "Collect a full performance trace: Core Web Vitals (FCP, LCP, CLS, INP), navigation timing (TTFB, server timing), Long Animation Frames (LoAF) with script attribution, and resource breakdown (slowest/largest). Pushes the full trace as an artifact and returns a summary. Read the artifact for detailed LoAF script attribution and resource analysis.",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      (_, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          const artifacts = yield* Artifacts;
          const page = yield* pw.getPage;
          const trace = yield* evaluateRuntime(page, "getPerformanceTrace");

          const hasMetrics = trace.webVitals.fcp || trace.webVitals.lcp || trace.webVitals.inp;
          if (!hasMetrics && trace.longAnimationFrames.length === 0) {
            return textResult("No performance metrics available yet.");
          }

          const traceDocument = formatPerformanceTrace(trace);
          yield* artifacts.push([new PerformanceTrace({ trace: traceDocument })]);

          const summary = ["Performance trace pushed as artifact.", "", "Web Vitals:"];
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
            `\nResources: ${trace.resources.totalCount} loaded (${Math.round(
              trace.resources.totalTransferSizeBytes / 1024,
            )}KB total)`,
          );

          return textResult(summary.join("\n"));
        }).pipe((effect) => run(effect, { signal, method: "performance_metrics" })),
    );

    // close
    server.registerTool(
      "close",
      {
        title: "Close Browser",
        description: "Close the browser and end the session.",
        annotations: { destructiveHint: true },
        inputSchema: {},
      },
      (_, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (!pw.hasSession()) {
            return textResult("No browser open.");
          }
          yield* pw.close();
          lastSnapshot = undefined;
          return textResult("Browser closed.");
        }).pipe((effect) => run(effect, { signal, method: "close" })),
    );

    const transport = yield* McpTransport;
    yield* Effect.logInfo(`Starting MCP server`);
    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => server.connect(transport),
        catch: (cause) =>
          new McpServerStartError({
            cause: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
      () =>
        Effect.tryPromise(() => server.close()).pipe(
          Effect.ignore({ message: "Failed to close MCP server", log: "Warn" }),
        ),
    );
  }),
).pipe(Layer.provide(Playwright.layer));
