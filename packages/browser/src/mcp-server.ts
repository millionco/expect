import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod/v4";
import { Config, Effect, Layer, Option, Schema, ServiceMap } from "effect";
import { BrowserJson } from "@expect/cookies";
import type { ConsoleLog, NetworkRequest } from "@expect/shared/models";
import { EXPECT_BROWSER_PROFILE_ENV_NAME } from "./mcp/constants";

import { Playwright, PlaywrightSession } from "./playwright";
import { Artifacts } from "./artifacts";
import { McpServerStartError, NoSnapshotError } from "./errors";
import { evaluateRuntime } from "./utils/evaluate-runtime";
import type { SnapshotResult } from "./types";
import { autoDiscoverCdp } from "./cdp-discovery";
import { hasStringMessage } from "@expect/shared/utils";

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
        },
      },
      ({ url, headed, cookies, waitUntil, cdp }, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (pw.hasSession()) {
            yield* pw.navigate(url, { waitUntil });
            return textResult(`Navigated to ${url}`);
          }

          yield* pw.open({
            headless: !headed,
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
          return textResult(`Opened ${url}`);
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
          "Execute Playwright code in the Node.js context. Available globals: page (Page), context (BrowserContext), browser (Browser), ref (function: ref ID from snapshot → Playwright Locator). Use `return` to send a value back as JSON. Supports await.",
        inputSchema: {
          code: z.string().describe("Playwright code to execute"),
        },
      },
      ({ code }, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          if (!lastSnapshot) return yield* new NoSnapshotError();
          const result = yield* pw.execute(code, lastSnapshot);
          return jsonResult(result);
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
          const art = yield* Artifacts;
          const logs = art.all().filter((a): a is ConsoleLog => a._tag === "ConsoleLog");
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
          "Get captured network requests. Optionally filter by HTTP method, URL substring, or resource type (document, script, stylesheet, image, xhr, fetch, etc.).",
        annotations: { readOnlyHint: true },
        inputSchema: {
          method: z.string().optional().describe("Filter by HTTP method (e.g. 'GET', 'POST')"),
          url: z.string().optional().describe("Filter by URL substring match"),
          resourceType: z
            .string()
            .optional()
            .describe("Filter by resource type (e.g. 'xhr', 'fetch', 'document', 'script')"),
        },
      },
      ({ method, url, resourceType }, { signal }) =>
        Effect.gen(function* () {
          const art = yield* Artifacts;
          const requests = art
            .all()
            .filter((a): a is NetworkRequest => a._tag === "NetworkRequest");

          const matchesMethod = (entry: NetworkRequest) =>
            !method || entry.method === method.toUpperCase();
          const matchesUrl = (entry: NetworkRequest) => !url || entry.url.includes(url);
          const matchesResourceType = (entry: NetworkRequest) =>
            !resourceType || entry.resourceType === resourceType.toLowerCase();

          const filtered = requests.filter(
            (entry) => matchesMethod(entry) && matchesUrl(entry) && matchesResourceType(entry),
          );

          return filtered.length === 0
            ? textResult("No network requests captured.")
            : jsonResult(filtered);
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
          "Get Core Web Vitals performance metrics (FCP, LCP, CLS, INP) for the current page. Each metric includes a value (milliseconds for FCP/LCP/INP, unitless score for CLS) and a rating (good, needs-improvement, poor). Metrics are collected automatically from page load and user interactions.",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      (_, { signal }) =>
        Effect.gen(function* () {
          const pw = yield* Playwright;
          const page = yield* pw.getPage;
          const metrics = yield* evaluateRuntime(page, "getPerformanceMetrics");
          const hasMetrics = metrics.fcp || metrics.lcp || metrics.inp;
          if (!hasMetrics) return textResult("No performance metrics available yet.");
          return jsonResult(metrics);
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
).pipe(Layer.provide(Playwright.layer), Layer.provide(Artifacts.layer));
