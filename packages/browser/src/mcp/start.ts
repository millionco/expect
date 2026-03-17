import { Effect } from "effect";
import { McpSession } from "./mcp-session.js";
import { McpRuntime } from "./runtime.js";
import { startBrowserMcpServer } from "./server.js";

let cleanupRegistered = false;

const registerProcessCleanup = () => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const handleShutdown = () => {
    void McpRuntime.runPromise(
      Effect.gen(function* () {
        const session = yield* McpSession;
        yield* session.close();
      }),
    ).finally(() => process.exit(0));
  };

  process.once("SIGINT", handleShutdown);
  process.once("SIGTERM", handleShutdown);
  process.once("beforeExit", () => {
    void McpRuntime.runPromise(
      Effect.gen(function* () {
        const session = yield* McpSession;
        yield* session.close();
      }),
    );
  });
};

registerProcessCleanup();
void startBrowserMcpServer(McpRuntime);
