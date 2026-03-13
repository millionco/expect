import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import { createPage } from "./create-page";
import { snapshot } from "./snapshot";
import { annotatedScreenshot } from "./annotated-screenshot";
import { diffSnapshots } from "./diff";
import { saveVideo } from "./save-video";
import type { SnapshotResult } from "./types";
import { waitForNavigationSettle } from "./utils/wait-for-settle";

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
}

let session: BrowserSession | null = null;

const setupPageTracking = (page: Page, browserSession: BrowserSession) => {
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

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const jsonResult = (data: unknown) => textResult(JSON.stringify(data, null, 2));

const imageResult = (base64: string) => ({
  content: [{ type: "image" as const, data: base64, mimeType: "image/png" }],
});

const actAndSnapshot = async (action: (before: SnapshotResult) => Promise<void>) => {
  const page = requirePage();
  const urlBefore = page.url();
  const before = await snapshot(page);
  await action(before);
  await waitForNavigationSettle(page, urlBefore);
  const after = await snapshot(page);
  return jsonResult({ tree: after.tree, refs: after.refs, stats: after.stats });
};

export const createBrowserMcpServer = () => {
  const server = new McpServer({
    name: "browser-tester",
    version: "0.0.1",
  });

  server.registerTool(
    "open",
    {
      title: "Open URL",
      description: "Navigate to a URL, launching the browser if needed.",
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

      const pageResult = await createPage(url, {
        headed,
        cookies,
        waitUntil,
      });
      const { browser, context, page } = pageResult;
      session = { browser, context, page, consoleMessages: [], networkRequests: [] };
      setupPageTracking(page, session);
      return textResult(`Opened ${url}`);
    },
  );

  server.registerTool(
    "snapshot",
    {
      title: "ARIA Snapshot",
      description:
        "Get an accessibility tree snapshot of the current page. Returns a tree with element refs (e1, e2, ...) that can be used with click, fill, type, select, hover.",
      inputSchema: {
        interactive: z.boolean().optional().describe("Only interactive elements"),
        compact: z.boolean().optional().describe("Remove empty structural elements"),
        maxDepth: z.number().optional().describe("Max tree depth"),
        selector: z.string().optional().describe("Scope to CSS selector"),
        cursor: z.boolean().optional().describe("Include cursor-interactive elements"),
        maxChars: z.number().optional().describe("Max output characters (default: unlimited)"),
        refId: z.string().optional().describe("Focus on a specific element by ref ID"),
      },
    },
    async ({ interactive, compact, maxDepth, selector, cursor, maxChars, refId }) => {
      const page = requirePage();
      const result = await snapshot(page, { interactive, compact, maxDepth, selector, cursor });

      let tree = result.tree;
      if (refId) {
        const refPattern = `[ref=${refId}]`;
        const lines = tree.split("\n");
        const refLineIndex = lines.findIndex((line) => line.includes(refPattern));
        if (refLineIndex >= 0) {
          const contextStart = Math.max(0, refLineIndex - 3);
          const contextEnd = Math.min(lines.length, refLineIndex + 10);
          tree = lines.slice(contextStart, contextEnd).join("\n");
        }
      }

      if (maxChars && tree.length > maxChars) {
        tree = `${tree.slice(0, maxChars)}... (truncated, ${result.stats.characters} chars total)`;
      }

      return jsonResult({ tree, refs: result.refs, stats: result.stats });
    },
  );

  server.registerTool(
    "click",
    {
      title: "Click Element",
      description: "Click an element by ref from the latest snapshot. Returns a new snapshot.",
      inputSchema: {
        ref: z.string().describe("Element ref (e.g. e1, e2)"),
      },
    },
    async ({ ref }) =>
      actAndSnapshot(async (before) => {
        await before.locator(ref).click();
      }),
  );

  server.registerTool(
    "fill",
    {
      title: "Fill Input",
      description: "Clear and fill an input element by ref. Returns a new snapshot.",
      inputSchema: {
        ref: z.string().describe("Element ref (e.g. e1, e2)"),
        value: z.string().describe("Value to fill"),
      },
    },
    async ({ ref, value }) =>
      actAndSnapshot(async (before) => {
        await before.locator(ref).fill(value);
      }),
  );

  server.registerTool(
    "type",
    {
      title: "Type Text",
      description:
        "Type text keystroke-by-keystroke into an element by ref. Returns a new snapshot.",
      inputSchema: {
        ref: z.string().describe("Element ref (e.g. e1, e2)"),
        text: z.string().describe("Text to type"),
      },
    },
    async ({ ref, text }) =>
      actAndSnapshot(async (before) => {
        await before.locator(ref).pressSequentially(text);
      }),
  );

  server.registerTool(
    "select",
    {
      title: "Select Option",
      description: "Select a dropdown option by ref. Returns a new snapshot.",
      inputSchema: {
        ref: z.string().describe("Element ref (e.g. e1, e2)"),
        value: z.string().describe("Option value to select"),
      },
    },
    async ({ ref, value }) =>
      actAndSnapshot(async (before) => {
        await before.locator(ref).selectOption(value);
      }),
  );

  server.registerTool(
    "hover",
    {
      title: "Hover Element",
      description: "Hover over an element by ref. Returns a new snapshot.",
      inputSchema: {
        ref: z.string().describe("Element ref (e.g. e1, e2)"),
      },
    },
    async ({ ref }) =>
      actAndSnapshot(async (before) => {
        await before.locator(ref).hover();
      }),
  );

  server.registerTool(
    "screenshot",
    {
      title: "Screenshot",
      description: "Take a screenshot of the current page. Returns the image as base64 PNG.",
      inputSchema: {
        fullPage: z.boolean().optional().describe("Capture the full scrollable page"),
      },
    },
    async ({ fullPage }) => {
      const page = requirePage();
      const buffer = await page.screenshot({ fullPage });
      return imageResult(buffer.toString("base64"));
    },
  );

  server.registerTool(
    "annotated_screenshot",
    {
      title: "Annotated Screenshot",
      description:
        "Take a screenshot with numbered labels overlaid on interactive elements. Returns the image and an annotation table mapping labels to refs.",
      inputSchema: {
        fullPage: z.boolean().optional().describe("Capture the full scrollable page"),
      },
    },
    async ({ fullPage }) => {
      const page = requirePage();
      const result = await annotatedScreenshot(page, { fullPage });
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
    },
  );

  server.registerTool(
    "diff",
    {
      title: "Diff Snapshots",
      description: "Diff two snapshot tree strings. Returns a unified diff with +/- lines.",
      inputSchema: {
        before: z.string().describe("The before snapshot tree text"),
        after: z.string().describe("The after snapshot tree text"),
      },
    },
    async ({ before, after }) => {
      const result = diffSnapshots(before, after);
      return jsonResult(result);
    },
  );

  server.registerTool(
    "save_video",
    {
      title: "Save Video",
      description:
        "Save the recorded video to a file. The browser must have been opened with video recording enabled.",
      inputSchema: {
        outputPath: z.string().describe("File path to save the video (.webm)"),
      },
    },
    async ({ outputPath }) => {
      const page = requirePage();
      const result = await saveVideo(page, outputPath);
      if (!result)
        return textResult(
          "No video recording active. Open the page with video recording enabled first.",
        );
      session = null;
      return textResult(`Video saved to ${result}`);
    },
  );

  server.registerTool(
    "navigate",
    {
      title: "Navigate",
      description: "Go back, forward, or reload the current page.",
      inputSchema: {
        action: z.enum(["back", "forward", "reload"]).describe("Navigation action"),
      },
    },
    async ({ action }) => {
      const page = requirePage();
      switch (action) {
        case "back":
          await page.goBack();
          break;
        case "forward":
          await page.goForward();
          break;
        case "reload":
          await page.reload();
          break;
      }
      return textResult(`Navigated ${action}. Current URL: ${page.url()}`);
    },
  );

  server.registerTool(
    "get_page_text",
    {
      title: "Get Page Text",
      description: "Extract all visible text content from the current page or a specific element.",
      inputSchema: {
        selector: z.string().optional().describe("CSS selector to scope text extraction"),
      },
    },
    async ({ selector }) => {
      const page = requirePage();
      const locator = selector ? page.locator(selector) : page.locator("body");
      const text = await locator.innerText();
      return textResult(text);
    },
  );

  server.registerTool(
    "javascript",
    {
      title: "Execute JavaScript",
      description:
        "Execute JavaScript in the page context. The expression is evaluated and the result is returned as JSON.",
      inputSchema: {
        expression: z.string().describe("JavaScript expression to evaluate"),
      },
    },
    async ({ expression }) => {
      const page = requirePage();
      const result = await page.evaluate(expression);
      return jsonResult(result);
    },
  );

  server.registerTool(
    "read_console_messages",
    {
      title: "Read Console Messages",
      description: "Read captured browser console messages (log, warn, error, info, debug).",
      inputSchema: {
        pattern: z.string().optional().describe("Regex pattern to filter messages"),
        onlyErrors: z.boolean().optional().describe("Only return error messages"),
        limit: z.number().optional().describe("Max messages to return (default: 100)"),
        clear: z.boolean().optional().describe("Clear messages after reading"),
      },
    },
    async ({ pattern, onlyErrors, limit, clear }) => {
      if (!session) return textResult("No browser open.");
      let messages = session.consoleMessages;
      if (onlyErrors) {
        messages = messages.filter((message) => message.type === "error");
      }
      if (pattern) {
        const regex = new RegExp(pattern);
        messages = messages.filter((message) => regex.test(message.text));
      }
      messages = messages.slice(-(limit ?? 100));
      const result = jsonResult(messages);
      if (clear) session.consoleMessages = [];
      return result;
    },
  );

  server.registerTool(
    "read_network_requests",
    {
      title: "Read Network Requests",
      description: "Read captured HTTP network requests from the browser.",
      inputSchema: {
        urlPattern: z.string().optional().describe("Filter by URL substring"),
        limit: z.number().optional().describe("Max requests to return (default: 100)"),
        clear: z.boolean().optional().describe("Clear requests after reading"),
      },
    },
    async ({ urlPattern, limit, clear }) => {
      if (!session) return textResult("No browser open.");
      let requests = session.networkRequests;
      if (urlPattern) {
        requests = requests.filter((request) => request.url.includes(urlPattern));
      }
      requests = requests.slice(-(limit ?? 100));
      const result = jsonResult(requests);
      if (clear) session.networkRequests = [];
      return result;
    },
  );

  server.registerTool(
    "scroll",
    {
      title: "Scroll",
      description: "Scroll the page or a specific element in a given direction.",
      inputSchema: {
        direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
        amount: z.number().optional().describe("Scroll amount in pixels (default: 500)"),
        selector: z.string().optional().describe("CSS selector of element to scroll"),
      },
    },
    async ({ direction, amount, selector }) => {
      const page = requirePage();
      const scrollAmount = amount ?? 500;
      const deltaX =
        direction === "right" ? scrollAmount : direction === "left" ? -scrollAmount : 0;
      const deltaY = direction === "down" ? scrollAmount : direction === "up" ? -scrollAmount : 0;

      if (selector) {
        await page.locator(selector).evaluate(
          (element, { deltaXValue, deltaYValue }) => {
            element.scrollBy(deltaXValue, deltaYValue);
          },
          { deltaXValue: deltaX, deltaYValue: deltaY },
        );
      } else {
        await page.mouse.wheel(deltaX, deltaY);
      }
      return textResult(`Scrolled ${direction} by ${scrollAmount}px`);
    },
  );

  server.registerTool(
    "drag",
    {
      title: "Drag and Drop",
      description: "Drag an element from one location to another using refs or coordinates.",
      inputSchema: {
        sourceRef: z.string().optional().describe("Source element ref"),
        targetRef: z.string().optional().describe("Target element ref"),
        sourceX: z.number().optional().describe("Source X coordinate"),
        sourceY: z.number().optional().describe("Source Y coordinate"),
        targetX: z.number().optional().describe("Target X coordinate"),
        targetY: z.number().optional().describe("Target Y coordinate"),
      },
    },
    async ({ sourceRef, targetRef, sourceX, sourceY, targetX, targetY }) => {
      const page = requirePage();

      if (sourceRef && targetRef) {
        const snapshotResult = await snapshot(page);
        const source = snapshotResult.locator(sourceRef);
        const target = snapshotResult.locator(targetRef);
        await source.dragTo(target);
      } else if (
        sourceX !== undefined &&
        sourceY !== undefined &&
        targetX !== undefined &&
        targetY !== undefined
      ) {
        await page.mouse.move(sourceX, sourceY);
        await page.mouse.down();
        await page.mouse.move(targetX, targetY);
        await page.mouse.up();
      } else {
        return textResult("Provide either sourceRef+targetRef or sourceX+sourceY+targetX+targetY");
      }

      const after = await snapshot(page);
      return jsonResult({ tree: after.tree, refs: after.refs, stats: after.stats });
    },
  );

  server.registerTool(
    "upload",
    {
      title: "Upload File",
      description: "Upload one or more files to a file input element by ref.",
      inputSchema: {
        ref: z.string().describe("File input element ref"),
        filePaths: z.array(z.string()).describe("Array of file paths to upload"),
      },
    },
    async ({ ref, filePaths }) => {
      const page = requirePage();
      const snapshotResult = await snapshot(page);
      const locator = snapshotResult.locator(ref);
      await locator.setInputFiles(filePaths);
      return textResult(`Uploaded ${filePaths.length} file(s) to ${ref}`);
    },
  );

  server.registerTool(
    "resize_window",
    {
      title: "Resize Window",
      description: "Resize the browser viewport to the given width and height.",
      inputSchema: {
        width: z.number().describe("Viewport width in pixels"),
        height: z.number().describe("Viewport height in pixels"),
      },
    },
    async ({ width, height }) => {
      const page = requirePage();
      await page.setViewportSize({ width, height });
      return textResult(`Viewport resized to ${width}x${height}`);
    },
  );

  server.registerTool(
    "tab_list",
    {
      title: "List Tabs",
      description: "List all open tabs with their URLs and titles.",
      inputSchema: {},
    },
    async () => {
      if (!session) return textResult("No browser open.");
      const pages = session.context.pages();
      const tabs = await Promise.all(
        pages.map(async (tabPage, index) => ({
          index,
          url: tabPage.url(),
          title: await tabPage.title(),
          active: tabPage === session!.page,
        })),
      );
      return jsonResult(tabs);
    },
  );

  server.registerTool(
    "tab_create",
    {
      title: "Create Tab",
      description: "Open a new tab, optionally navigating to a URL.",
      inputSchema: {
        url: z.string().optional().describe("URL to open in the new tab"),
      },
    },
    async ({ url }) => {
      if (!session) return textResult("No browser open.");
      const newPage = await session.context.newPage();
      if (url) await newPage.goto(url);
      setupPageTracking(newPage, session);
      session.page = newPage;
      return textResult(`New tab created${url ? ` at ${url}` : ""}`);
    },
  );

  server.registerTool(
    "tab_switch",
    {
      title: "Switch Tab",
      description: "Switch to a tab by index (from tab_list).",
      inputSchema: {
        index: z.number().describe("Tab index to switch to"),
      },
    },
    async ({ index }) => {
      if (!session) return textResult("No browser open.");
      const pages = session.context.pages();
      if (index < 0 || index >= pages.length) {
        return textResult(`Invalid tab index ${index}. ${pages.length} tabs open.`);
      }
      session.page = pages[index];
      await session.page.bringToFront();
      return textResult(`Switched to tab ${index}: ${session.page.url()}`);
    },
  );

  server.registerTool(
    "tab_close",
    {
      title: "Close Tab",
      description:
        "Close a tab by index. If the active tab is closed, switches to the previous tab.",
      inputSchema: {
        index: z.number().optional().describe("Tab index to close (default: active tab)"),
      },
    },
    async ({ index }) => {
      if (!session) return textResult("No browser open.");
      const pages = session.context.pages();
      const targetIndex = index ?? pages.indexOf(session.page);
      if (targetIndex < 0 || targetIndex >= pages.length) {
        return textResult(`Invalid tab index ${targetIndex}.`);
      }
      const targetPage = pages[targetIndex];
      const wasActive = targetPage === session.page;
      await targetPage.close();

      const remainingPages = session.context.pages();
      if (remainingPages.length === 0) {
        await session.browser.close();
        session = null;
        return textResult("Last tab closed. Browser closed.");
      }

      if (wasActive) {
        session.page = remainingPages[Math.min(targetIndex, remainingPages.length - 1)];
      }
      return textResult(`Tab ${targetIndex} closed. ${remainingPages.length} tabs remaining.`);
    },
  );

  server.registerTool(
    "find",
    {
      title: "Find Elements",
      description:
        "Find elements on the page by text content, CSS selector, or role. Returns matching elements with their refs from the current snapshot.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Text to search for, CSS selector (prefix with 'css:'), or ARIA role (prefix with 'role:')",
          ),
      },
    },
    async ({ query }) => {
      const page = requirePage();
      const snapshotResult = await snapshot(page);

      if (query.startsWith("css:")) {
        const cssSelector = query.slice(4).trim();
        const count = await page.locator(cssSelector).count();
        const elements = [];
        for (let index = 0; index < Math.min(count, 20); index++) {
          const element = page.locator(cssSelector).nth(index);
          const text = await element.innerText().catch(() => "");
          const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
          elements.push({ index, tagName, text: text.slice(0, 100) });
        }
        return jsonResult({ selector: cssSelector, count, elements });
      }

      if (query.startsWith("role:")) {
        const role = query.slice(5).trim();
        const matchingRefs = Object.entries(snapshotResult.refs)
          .filter(([, entry]) => entry.role === role)
          .map(([ref, entry]) => ({ ref, role: entry.role, name: entry.name }));
        return jsonResult({ role, count: matchingRefs.length, matches: matchingRefs.slice(0, 20) });
      }

      const queryLower = query.toLowerCase();
      const matchingRefs = Object.entries(snapshotResult.refs)
        .filter(([, entry]) => entry.name.toLowerCase().includes(queryLower))
        .map(([ref, entry]) => ({ ref, role: entry.role, name: entry.name }));
      return jsonResult({ query, count: matchingRefs.length, matches: matchingRefs.slice(0, 20) });
    },
  );

  server.registerTool(
    "wait",
    {
      title: "Wait",
      description:
        "Wait for a condition: element visibility, time delay, URL pattern, or load state.",
      inputSchema: {
        selector: z.string().optional().describe("CSS selector to wait for visibility"),
        timeout: z.number().optional().describe("Time to wait in milliseconds"),
        url: z.string().optional().describe("URL pattern to wait for (glob)"),
        loadState: z
          .enum(["load", "domcontentloaded", "networkidle"])
          .optional()
          .describe("Wait for load state"),
      },
    },
    async ({ selector, timeout, url, loadState }) => {
      const page = requirePage();

      if (selector) {
        await page.locator(selector).waitFor({ state: "visible", timeout: timeout ?? 30000 });
        return textResult(`Element "${selector}" is now visible`);
      }

      if (url) {
        await page.waitForURL(url, { timeout: timeout ?? 30000 });
        return textResult(`URL matched: ${page.url()}`);
      }

      if (loadState) {
        await page.waitForLoadState(loadState, { timeout: timeout ?? 30000 });
        return textResult(`Load state "${loadState}" reached`);
      }

      if (timeout) {
        await page.waitForTimeout(timeout);
        return textResult(`Waited ${timeout}ms`);
      }

      return textResult(
        "Provide at least one wait condition: selector, timeout, url, or loadState",
      );
    },
  );

  server.registerTool(
    "press_key",
    {
      title: "Press Key",
      description: "Press a keyboard key or key combination (e.g. Enter, Tab, Control+a, Escape).",
      inputSchema: {
        key: z.string().describe("Key or key combination to press"),
      },
    },
    async ({ key }) => {
      const page = requirePage();
      await page.keyboard.press(key);
      return textResult(`Pressed ${key}`);
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
      await session.browser.close();
      session = null;
      return textResult("Browser closed.");
    },
  );

  return server;
};

export const startBrowserMcpServer = async () => {
  const server = createBrowserMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
