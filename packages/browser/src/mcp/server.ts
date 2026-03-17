import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod/v4";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import { Effect } from "effect";
import { runBrowser } from "../browser.js";
import type { SnapshotResult } from "../types.js";
import {
  BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME,
  BROWSER_TESTER_VIDEO_OUTPUT_ENV_NAME,
} from "./constants.js";
import { startLiveViewServer, type LiveViewServer } from "./live-view-server.js";

interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: number;
}

interface NetworkEntry {
  url: string;
  method: string;
  status: number | null;
  resourceType: string;
  timestamp: number;
}

interface BrowserSession {
  browser: PlaywrightBrowser;
  context: BrowserContext;
  page: Page;
  consoleMessages: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  videoOutputPath?: string;
  savedVideoPath?: string;
  trackedPages: Set<Page>;
  lastSnapshot: SnapshotResult | null;
}

interface ClosedSessionResult {
  savedVideoPath: string | undefined;
}

let session: BrowserSession | null = null;
let liveViewServer: LiveViewServer | null = null;

const setupPageTracking = (page: Page, browserSession: BrowserSession) => {
  if (browserSession.trackedPages.has(page)) return;
  browserSession.trackedPages.add(page);

  page.on("console", (message) => {
    browserSession.consoleMessages.push({
      type: message.type(),
      text: message.text(),
      timestamp: Date.now(),
    });
  });

  page.on("request", (request) => {
    browserSession.networkRequests.push({
      url: request.url(),
      method: request.method(),
      status: null,
      resourceType: request.resourceType(),
      timestamp: Date.now(),
    });
  });

  page.on("response", (response) => {
    const entry = browserSession.networkRequests.find(
      (networkEntry) => networkEntry.url === response.url() && networkEntry.status === null,
    );
    if (entry) entry.status = response.status();
  });
};

const requirePage = (): Page => {
  if (!session) throw new Error("No browser open. Call the 'open' tool first.");
  return session.page;
};

const saveSessionVideo = async (
  browserSession: BrowserSession,
  outputPath?: string,
): Promise<string | undefined> => {
  const resolvedOutputPath = outputPath ?? browserSession.videoOutputPath;
  if (!resolvedOutputPath) return undefined;
  if (browserSession.savedVideoPath) return browserSession.savedVideoPath;

  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  const savedVideoPath = await runBrowser((browser) =>
    browser.saveVideo(browserSession.page, resolvedOutputPath),
  );
  browserSession.savedVideoPath = savedVideoPath;
  return savedVideoPath;
};

const closeSession = async (outputPath?: string): Promise<ClosedSessionResult | null> => {
  if (!session) return null;

  const activeSession = session;
  session = null;

  if (liveViewServer) {
    await liveViewServer.close().catch(() => {});
    liveViewServer = null;
  }

  const savedVideoPath = await saveSessionVideo(activeSession, outputPath);
  await activeSession.browser.close();

  return { savedVideoPath };
};

let cleanupRegistered = false;

const registerProcessCleanup = () => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const handleShutdown = () => {
    void closeSession().finally(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", handleShutdown);
  process.once("SIGTERM", handleShutdown);
  process.once("beforeExit", () => closeSession());
};

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

export const createBrowserMcpServer = () => {
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
    async ({ url, headed, cookies, waitUntil }) => {
      if (session) {
        await session.page.goto(url, { waitUntil: waitUntil ?? "load" });
        return textResult(`Navigated to ${url}`);
      }

      const videoOutputPath = process.env[BROWSER_TESTER_VIDEO_OUTPUT_ENV_NAME];
      const pageResult = await runBrowser((browser) =>
        browser.createPage(url, {
          headed,
          cookies,
          waitUntil,
          video: videoOutputPath ? { dir: dirname(videoOutputPath) } : undefined,
        }),
      );
      const { browser, context, page } = pageResult;
      session = {
        browser,
        context,
        page,
        consoleMessages: [],
        networkRequests: [],
        videoOutputPath,
        savedVideoPath: undefined,
        trackedPages: new Set(),
        lastSnapshot: null,
      };
      setupPageTracking(page, session);

      const liveViewUrl = process.env[BROWSER_TESTER_LIVE_VIEW_URL_ENV_NAME];
      if (liveViewUrl && !liveViewServer) {
        liveViewServer = await startLiveViewServer({
          liveViewUrl,
          getPage: () => session?.page ?? null,
        });
      }

      const injectedCookies = await context.cookies();
      return textResult(
        `Opened ${url}` +
          (injectedCookies.length > 0
            ? ` (${injectedCookies.length} cookies synced from local browser)`
            : ""),
      );
    },
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
    async ({ code }) => {
      const page = requirePage();
      const ref = (refId: string) => {
        if (!session!.lastSnapshot)
          throw new Error("No snapshot taken yet. Call screenshot with mode 'snapshot' first.");
        return Effect.runSync(session!.lastSnapshot.locator(refId));
      };
      try {
        const userFunction = new AsyncFunction("page", "context", "browser", "ref", code);
        const result = await userFunction(page, session!.context, session!.browser, ref);
        if (result === undefined) return textResult("OK");
        return jsonResult(result);
      } catch (error) {
        return textResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
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
    async ({ mode, fullPage }) => {
      const page = requirePage();
      const resolvedMode = mode ?? "screenshot";

      if (resolvedMode === "snapshot") {
        const result = await runBrowser((browser) => browser.snapshot(page));
        session!.lastSnapshot = result;
        return jsonResult({ tree: result.tree, refs: result.refs, stats: result.stats });
      }

      if (resolvedMode === "annotated") {
        const result = await runBrowser((browser) =>
          browser.annotatedScreenshot(page, { fullPage }),
        );
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

      const buffer = await page.screenshot({ fullPage });
      return imageResult(buffer.toString("base64"));
    },
  );

  server.registerTool(
    "close",
    {
      title: "Close Browser",
      description: "Close the browser and end the session.",
      inputSchema: {},
    },
    async () => {
      if (!session) return textResult("No browser open.");
      const closeResult = await closeSession();
      if (!closeResult) return textResult("No browser open.");
      if (closeResult.savedVideoPath) {
        return textResult(`Browser closed. Video saved to ${closeResult.savedVideoPath}`);
      }
      return textResult("Browser closed.");
    },
  );

  return server;
};

export const startBrowserMcpServer = async () => {
  registerProcessCleanup();
  const server = createBrowserMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
