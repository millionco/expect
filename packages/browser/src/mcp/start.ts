import { Effect } from "effect";
import { McpSession } from "./mcp-session";
import { McpRuntime } from "./runtime";
import { startBrowserMcpServer } from "./server";

let cleanupRegistered = false;

const closeSession = Effect.gen(function* () {
  const session = yield* McpSession;
  yield* session.close();
});

const registerProcessCleanup = () => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const handleShutdown = () => {
    void McpRuntime.runPromise(closeSession).finally(() => process.exit(0));
  };

  process.once("SIGINT", handleShutdown);
  process.once("SIGTERM", handleShutdown);
  process.once("beforeExit", () => {
    void McpRuntime.runPromise(closeSession);
  });
};

registerProcessCleanup();
void startBrowserMcpServer(McpRuntime);
