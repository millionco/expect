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

export const createBrowserMcpServer = <E>(
  runtime: ManagedRuntime.ManagedRuntime<McpSession, E>,
) => {
  const runMcp = <A>(effect: Effect.Effect<A, unknown, McpSession>) => runtime.runPromise(effect);

  const server = new McpServer({
    name: "browser-tester",
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
    "close",
    {
      title: "Close Browser",
      description: "Close the browser and end the session.",
      inputSchema: {},
    },
    () =>
      runMcp(
        Effect.gen(function* () {
          const session = yield* McpSession;
          const result = yield* session.close();
          if (!result) return textResult("No browser open.");
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
