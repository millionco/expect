import { Effect } from "effect";
import { McpSession } from "./mcp-session";
import { registerProcessCleanup } from "./register-process-cleanup";
import { McpRuntime } from "./runtime";
import { startBrowserMcpServer } from "./server";

const closeSession = Effect.gen(function* () {
  const session = yield* McpSession;
  yield* session.close();
});

registerProcessCleanup({
  cleanup: () => McpRuntime.runPromise(closeSession),
  watchStdin: true,
});

void startBrowserMcpServer(McpRuntime);
