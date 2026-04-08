import * as fs from "node:fs";
import * as http from "node:http";
import { Effect, Predicate } from "effect";
import { McpSession } from "./mcp-session";
import { McpRuntime } from "./runtime";
import { createBrowserMcpServer } from "./server";
import { CLI_SESSION_FILE, MAX_DAEMON_REQUEST_BODY_BYTES } from "./constants";

const { tools } = createBrowserMcpServer(McpRuntime);

const TOOL_NAMES = new Set<string>(Object.keys(tools));

const readRequestBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_DAEMON_REQUEST_BODY_BYTES) {
        settled = true;
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) resolve(Buffer.concat(chunks).toString());
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });

const parseArgs = (body: string): Record<string, unknown> => {
  if (body.length === 0) return {};
  const parsed: unknown = JSON.parse(body);
  if (!Predicate.isObject(parsed) || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
};

const httpServer = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const toolName = req.url?.slice(1);
  if (!toolName || !TOOL_NAMES.has(toolName)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
    return;
  }

  try {
    const body = await readRequestBody(req);
    const args = parseArgs(body);
    const tool = tools[toolName as keyof typeof tools];
    const abortController = new AbortController();
    req.on("close", () => abortController.abort());
    // HACK: cast handler to callable — AnyToolHandler includes ToolTaskHandler which tsgo rejects as non-callable, but registerTool always returns a ToolCallback
    const handler = tool.handler as (
      args: Record<string, unknown>,
      extra: { signal: AbortSignal },
    ) => Promise<unknown>;
    const result = await handler(args, { signal: abortController.signal });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

const removeSessionFile = () => {
  try {
    fs.unlinkSync(CLI_SESSION_FILE);
  } catch {
    // HACK: best-effort cleanup — file may already be gone
  }
};

const closeSession = Effect.gen(function* () {
  const session = yield* McpSession;
  yield* session.close();
});

const shutdown = () => {
  void McpRuntime.runPromise(closeSession).finally(() => {
    removeSessionFile();
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("beforeExit", () => {
  void McpRuntime.runPromise(closeSession).finally(removeSessionFile);
});

httpServer.listen(0, "127.0.0.1", () => {
  const address = httpServer.address();
  if (typeof address === "object" && address) {
    fs.writeFileSync(CLI_SESSION_FILE, JSON.stringify({ pid: process.pid, port: address.port }));
    process.stderr.write(`expect daemon listening on 127.0.0.1:${address.port}\n`);
  }
});
