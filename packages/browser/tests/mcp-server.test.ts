import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect";
import { NodeServices } from "@effect/platform-node";
import { layerMcpServer, McpTransport } from "../src/mcp/index";

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
let runtime: ManagedRuntime.ManagedRuntime<never, never>;

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

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const testLayer = layerMcpServer.pipe(
    Layer.provide(Layer.succeed(McpTransport, serverTransport)),
    Layer.provide(ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ EXPECT_PLAN_ID: "test-plan" }))),
    Layer.provide(NodeServices.layer),
  );

  runtime = ManagedRuntime.make(testLayer);
  mcpClient = new Client({ name: "test-client", version: "0.0.1" });

  // Build the runtime (starts MCP server) and connect client concurrently
  await Promise.all([
    runtime.runPromise(Effect.void),
    mcpClient.connect(clientTransport),
  ]);
}, 30_000);

afterAll(async () => {
  await callTool("close").catch(() => {});
  await mcpClient.close();
  await runtime.dispose();
  httpServer.close();
});

describe("MCP server tools", () => {
  it("lists all tools", async () => {
    const tools = await mcpClient.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    expect(toolNames).toContain("open");
    expect(toolNames).toContain("screenshot");
    expect(toolNames).toContain("playwright");
    expect(toolNames).toContain("close");
    expect(toolNames).toContain("console_logs");
    expect(toolNames).toContain("network_requests");
    expect(toolNames).toContain("performance_metrics");
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
    expect(textContent(fillResult)).toContain("OK");

    const clickResult = await callTool("playwright", {
      code: `await ref('${submitRef![0]}').click();`,
    });
    expect(textContent(clickResult)).toContain("OK");

    const verifyResult = await callTool("playwright", {
      code: `return await page.locator('#result').innerText();`,
    });
    expect(textContent(verifyResult)).toContain("Clicked: hello@test.com");
  });

  it("screenshot modes return correct content types", async () => {
    const screenshotResult = await callTool("screenshot", { mode: "screenshot" });
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

  it("playwright returns error text on failure instead of throwing", async () => {
    const result = await callTool("playwright", {
      code: `throw new Error('intentional test error');`,
    });
    expect(textContent(result)).toContain("Error: intentional test error");
  });

  it("close flushes the session", async () => {
    const closeResult = await callTool("close");
    expect(textContent(closeResult)).toContain("Browser closed");

    const doubleClose = await callTool("close");
    expect(textContent(doubleClose)).toContain("No browser open");
  });

  it("ref() throws when no snapshot has been taken", async () => {
    await callTool("open", { url: testServerUrl });
    const result = await callTool("playwright", {
      code: `await ref('e1').click();`,
    });
    expect(textContent(result)).toContain("No snapshot taken yet");
    await callTool("close");
  });
});
