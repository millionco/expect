import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { Effect, type ManagedRuntime } from "effect";
import { McpSession } from "./mcp-session";

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
      },
    },
    ({ url, headed, cookies, waitUntil }) =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          if (session.hasSession()) {
            yield* session.navigate(url, { waitUntil });
            return textResult(`Navigated to ${url}`);
          }
          const result = yield* session.open(url, { headed, cookies, waitUntil });
          return textResult(
            `Opened ${url}` +
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
          if (!session.hasSession()) return textResult("No browser open.");
          yield* session.close();
          return textResult("Browser closed.");
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
