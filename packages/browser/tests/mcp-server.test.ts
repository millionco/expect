import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpRuntime } from "../src/mcp/runtime";
import { createBrowserMcpServer } from "../src/mcp/server";

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

  const server = createBrowserMcpServer(McpRuntime);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcpClient = new Client({ name: "test-client", version: "0.0.1" });
  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  mcpCleanup = async () => {
    await mcpClient.close();
    await server.close();
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
      "accessibility_audit",
      "close",
      "console_logs",
      "network_requests",
      "open",
      "performance_metrics",
      "playwright",
      "screenshot",
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

  it("playwright snapshotAfter returns fresh snapshot alongside result", async () => {
    await callTool("open", { url: testServerUrl });
    await callTool("screenshot", { mode: "snapshot" });

    const result = await callTool("playwright", {
      code: `return await page.title();`,
      snapshotAfter: true,
    });
    const data = JSON.parse(textContent(result));
    expect(data).toHaveProperty("result");
    expect(data).toHaveProperty("snapshot");
    expect(data.snapshot).toHaveProperty("tree");
    expect(data.snapshot).toHaveProperty("refs");
    expect(data.snapshot).toHaveProperty("stats");
    expect(data.snapshot.tree).toContain("Submit");
    await callTool("close");
  });

  it("playwright snapshotAfter with no return value omits result key", async () => {
    await callTool("open", { url: testServerUrl });
    await callTool("screenshot", { mode: "snapshot" });

    const result = await callTool("playwright", {
      code: `await ref('e1').click();`,
      snapshotAfter: true,
    });
    const data = JSON.parse(textContent(result));
    expect(data).not.toHaveProperty("result");
    expect(data).toHaveProperty("snapshot");
    expect(data.snapshot).toHaveProperty("tree");
    await callTool("close");
  });

  it("playwright without snapshotAfter returns plain result", async () => {
    await callTool("open", { url: testServerUrl });
    const result = await callTool("playwright", {
      code: `return 42;`,
    });
    expect(textContent(result)).toBe("42");
    await callTool("close");
  });

  it("ref() throws when no snapshot has been taken", async () => {
    await callTool("open", { url: testServerUrl });
    const result = await callTool("playwright", {
      code: `await ref('e1').click();`,
    });
    expect(textContent(result)).toContain("No snapshot taken yet");
    await callTool("close");
  });

  it("open tool accepts browser parameter in schema", async () => {
    const tools = await mcpClient.listTools();
    const openTool = tools.tools.find((tool) => tool.name === "open");
    expect(openTool).toBeDefined();
    const schema = openTool!.inputSchema as { properties?: Record<string, unknown> };
    expect(schema.properties).toHaveProperty("browser");
  });

  it("open with browser=webkit launches a webkit session", async () => {
    const openResult = await callTool("open", { url: testServerUrl, browser: "webkit" });
    const text = textContent(openResult);

    if (text.includes("Executable doesn't exist")) {
      await callTool("close").catch(() => {});
      return;
    }

    expect(text).toContain("Opened");
    expect(text).toContain("[webkit]");

    const snapshotResult = await callTool("screenshot", { mode: "snapshot" });
    const snapshotData = JSON.parse(textContent(snapshotResult));
    expect(snapshotData.tree).toContain("Test Page");

    await callTool("close");
  });

  it("switches from chromium to webkit via close → open", async () => {
    const chromiumResult = await callTool("open", { url: testServerUrl });
    expect(textContent(chromiumResult)).toContain("Opened");
    expect(textContent(chromiumResult)).not.toContain("[webkit]");

    const chromiumSnapshot = await callTool("screenshot", { mode: "snapshot" });
    expect(JSON.parse(textContent(chromiumSnapshot)).tree).toContain("Test Page");

    await callTool("close");

    const webkitResult = await callTool("open", { url: testServerUrl, browser: "webkit" });
    const webkitText = textContent(webkitResult);

    if (webkitText.includes("Executable doesn't exist")) {
      await callTool("close").catch(() => {});
      return;
    }

    expect(webkitText).toContain("Opened");
    expect(webkitText).toContain("[webkit]");

    const webkitSnapshot = await callTool("screenshot", { mode: "snapshot" });
    expect(JSON.parse(textContent(webkitSnapshot)).tree).toContain("Test Page");

    await callTool("close");
  });

  it("open with browser=firefox launches a firefox session", async () => {
    const openResult = await callTool("open", { url: testServerUrl, browser: "firefox" });
    const text = textContent(openResult);

    if (text.includes("Executable doesn't exist")) {
      await callTool("close").catch(() => {});
      return;
    }

    expect(text).toContain("Opened");
    expect(text).toContain("[firefox]");

    const snapshotResult = await callTool("screenshot", { mode: "snapshot" });
    const snapshotData = JSON.parse(textContent(snapshotResult));
    expect(snapshotData.tree).toContain("Test Page");

    await callTool("close");
  });

  it("navigates within an existing session instead of relaunching", async () => {
    await callTool("open", { url: testServerUrl });

    const navResult = await callTool("open", { url: testServerUrl, browser: "webkit" });
    expect(textContent(navResult)).toContain("Navigated");
    expect(textContent(navResult)).not.toContain("[webkit]");

    await callTool("close");
  });
});
