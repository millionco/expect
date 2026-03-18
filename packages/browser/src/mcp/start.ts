import { Effect } from "effect";
import { McpSession } from "./mcp-session";
import { McpRuntime } from "./runtime";
import { startBrowserMcpServer } from "./server";

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
void McpRuntime.runPromise(Effect.void);
void startBrowserMcpServer(McpRuntime);
