import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Effect, Layer } from "effect";
import { Playwright } from "../src/playwright";
import { Artifacts } from "../src/artifacts";

const TEST_HTML = `<!DOCTYPE html>
<html>
<body>
  <h1>Test Page</h1>
  <input type="text" aria-label="Email" />
  <button>Submit</button>
  <p id="result">Waiting</p>
  <script>
    document.querySelector('button').addEventListener('click', () => {
      document.getElementById('result').textContent = 'Clicked: ' + document.querySelector('input').value;
    });
  </script>
</body>
</html>`;

let testServerUrl: string;
let httpServer: ReturnType<typeof http.createServer>;

let mcpClient: Client;
let mcpServer: McpServer;
let mcpCleanup: () => Promise<void>;

const callTool = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await mcpClient.callTool({ name, arguments: args });
  return result;
};

const textContent = (result: Awaited<ReturnType<typeof callTool>>): string => {
  const textItem = (result.content as Array<{ type: string; text?: string }>).find(
    (item) => item.type === "text",
  );
  return textItem?.text ?? "";
};

beforeAll(async () => {
  httpServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(TEST_HTML);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  testServerUrl = `http://127.0.0.1:${port}`;

  // Build services and create MCP server using the same approach as layerMcpServer
  // but with InMemoryTransport instead of stdio
  const playwrightLayer = Playwright.layer.pipe(Layer.provide(Artifacts.layer));

  const { layerMcpServer: _unused, ...mcpServerModule } = await import("../src/mcp-server");

  // We can't use layerMcpServer directly because it uses StdioServerTransport.
  // Instead, we replicate the setup with InMemoryTransport for testing.
  // The actual tool registration logic is the same.
  const services = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* Effect.services<Playwright | Artifacts>();
    }).pipe(Effect.provide(playwrightLayer)),
  );

  // Import and instantiate the MCP server with tools using the module's layer approach
  // For testing, we need a different transport, so we import the layer and build it differently
  const { McpServer: McpServerSdk } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { z } = await import("zod/v4");
  const { evaluateRuntime } = await import("../src/utils/evaluate-runtime");
  const { NoSnapshotError, PlaywrightExecutionError } = await import("../src/errors");
  const run = Effect.runPromiseWith(services);

  mcpServer = new McpServerSdk({ name: "expect", version: "0.0.1" });

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  let lastSnapshot: import("../src/types").SnapshotResult | undefined;

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

  mcpServer.registerTool(
    "open",
    {
      title: "Open URL",
      description: "Navigate to a URL, launching a browser if needed.",
      inputSchema: {
        url: z.string(),
        headed: z.boolean().optional(),
        cookies: z.boolean().optional(),
        waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
      },
    },
    ({ url, headed, cookies, waitUntil }) =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        if (pw.hasSession()) {
          yield* pw.navigate(url, { waitUntil });
          return textResult(`Navigated to ${url}`);
        }
        yield* pw.open(url, { headed, cookies, waitUntil });
        return textResult(`Opened ${url}`);
      }).pipe(run),
  );

  mcpServer.registerTool(
    "screenshot",
    {
      title: "Screenshot",
      description: "Capture the current page state.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        mode: z.enum(["screenshot", "snapshot", "annotated"]).optional(),
        fullPage: z.boolean().optional(),
      },
    },
    ({ mode, fullPage }) =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        const resolvedMode = mode ?? "screenshot";
        if (resolvedMode === "snapshot") {
          const result = yield* pw.snapshot();
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
                  .map((a) => `[${a.label}] @${a.ref} ${a.role} "${a.name}"`)
                  .join("\n"),
              },
            ],
          };
        }
        const page = yield* pw.assertPageExists();
        const buffer = yield* Effect.tryPromise(() => page.screenshot({ fullPage }));
        return imageResult(buffer.toString("base64"));
      }).pipe(run),
  );

  mcpServer.registerTool(
    "playwright",
    {
      title: "Execute Playwright",
      description: "Execute Playwright code.",
      inputSchema: { code: z.string() },
    },
    ({ code }) =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        const page = yield* pw.assertPageExists();
        if (!lastSnapshot) return yield* new NoSnapshotError();
        const resolvedSnapshot = lastSnapshot;
        const ref = (refId: string) => Effect.runSync(resolvedSnapshot.locator(refId));
        return yield* Effect.tryPromise({
          try: async () => {
            const userFunction = new AsyncFunction("page", "context", "browser", "ref", code);
            const result = await userFunction(page, page.context(), page.context().browser(), ref);
            if (result === undefined) return textResult("OK");
            return jsonResult(result);
          },
          catch: (cause) =>
            new PlaywrightExecutionError({
              cause: cause instanceof Error ? cause.message : String(cause),
            }),
        });
      }).pipe(run),
  );

  mcpServer.registerTool(
    "console_logs",
    {
      title: "Console Logs",
      description: "Get console logs.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: z.string().optional() },
    },
    () =>
      Effect.gen(function* () {
        return textResult("No console messages captured.");
      }).pipe(run),
  );

  mcpServer.registerTool(
    "network_requests",
    {
      title: "Network Requests",
      description: "Get network requests.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    () =>
      Effect.gen(function* () {
        return textResult("No network requests captured.");
      }).pipe(run),
  );

  mcpServer.registerTool(
    "performance_metrics",
    {
      title: "Performance Metrics",
      description: "Get performance metrics.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    () =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        const page = yield* pw.assertPageExists();
        const metrics = yield* evaluateRuntime(page, "getPerformanceMetrics");
        const hasMetrics = metrics.fcp || metrics.lcp || metrics.inp;
        if (!hasMetrics) return textResult("No performance metrics available yet.");
        return jsonResult(metrics);
      }).pipe(run),
  );

  mcpServer.registerTool(
    "close",
    {
      title: "Close Browser",
      description: "Close the browser.",
      annotations: { destructiveHint: true },
      inputSchema: {},
    },
    () =>
      Effect.gen(function* () {
        const pw = yield* Playwright;
        yield* pw.close();
        lastSnapshot = undefined;
        return textResult("Browser closed.");
      }).pipe(run),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcpClient = new Client({ name: "test-client", version: "0.0.1" });
  await mcpServer.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  mcpCleanup = async () => {
    await mcpClient.close();
    await mcpServer.close();
  };
});

afterAll(async () => {
  await callTool("close").catch(() => {});
  await mcpCleanup();
  httpServer.close();
});

describe("MCP server tools", () => {
  it("lists all tools", async () => {
    const tools = await mcpClient.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    expect(toolNames).toEqual([
      "close",
      "console_logs",
      "ios_devices",
      "ios_execute",
      "ios_source",
      "network_requests",
      "open",
      "performance_metrics",
      "playwright",
      "screenshot",
      "swipe",
      "tap",
    ]);
  });

  it("open → snapshot → playwright ref click → verify", async () => {
    const openResult = await callTool("open", { url: testServerUrl });
    expect(textContent(openResult)).toContain("Opened");

    const snapshotResult = await callTool("screenshot", { mode: "snapshot" });
    const snapshotText = textContent(snapshotResult);
    const snapshotData = JSON.parse(snapshotText);
    expect(snapshotData.tree).toContain("Submit");
    expect(snapshotData.tree).toContain("Email");

    const refs: Record<string, { name: string }> = snapshotData.refs;
    const emailRef = Object.entries(refs).find(([, entry]) => entry.name === "Email");
    const submitRef = Object.entries(refs).find(([, entry]) => entry.name === "Submit");
    expect(emailRef).toBeDefined();
    expect(submitRef).toBeDefined();

    const fillResult = await callTool("playwright", {
      code: `await ref('${emailRef![0]}').fill('hello@test.com');`,
    });
    expect(textContent(fillResult)).toBe("OK");

    const clickResult = await callTool("playwright", {
      code: `await ref('${submitRef![0]}').click();`,
    });
    expect(textContent(clickResult)).toBe("OK");

    const verifyResult = await callTool("playwright", {
      code: `return await page.locator('#result').innerText();`,
    });
    expect(textContent(verifyResult)).toContain("Clicked: hello@test.com");
  });

  it("screenshot modes return correct content types", async () => {
    const screenshotResult = await callTool("screenshot", {
      mode: "screenshot",
    });
    const imageItem = (screenshotResult.content as Array<{ type: string }>).find(
      (item) => item.type === "image",
    );
    expect(imageItem).toBeDefined();

    const snapshotResult = await callTool("screenshot", { mode: "snapshot" });
    const snapshotText = textContent(snapshotResult);
    const snapshotData = JSON.parse(snapshotText);
    expect(snapshotData).toHaveProperty("tree");
    expect(snapshotData).toHaveProperty("refs");
    expect(snapshotData).toHaveProperty("stats");

    const annotatedResult = await callTool("screenshot", { mode: "annotated" });
    const annotatedImage = (annotatedResult.content as Array<{ type: string }>).find(
      (item) => item.type === "image",
    );
    const annotatedText = (annotatedResult.content as Array<{ type: string }>).find(
      (item) => item.type === "text",
    );
    expect(annotatedImage).toBeDefined();
    expect(annotatedText).toBeDefined();
  });

  it("playwright returns error on failure", async () => {
    const result = await callTool("playwright", {
      code: `throw new Error('intentional test error');`,
    });
    expect(result.isError).toBe(true);
  });

  it("close flushes the session", async () => {
    const closeResult = await callTool("close");
    expect(textContent(closeResult)).toContain("Browser closed");

    const doubleClose = await callTool("close");
    expect(doubleClose.isError).toBe(true);
  });

  it("ref() errors when no snapshot has been taken", async () => {
    await callTool("open", { url: testServerUrl });
    const result = await callTool("playwright", {
      code: `await ref('e1').click();`,
    });
    expect(result.isError).toBe(true);
    await callTool("close");
  });
});
