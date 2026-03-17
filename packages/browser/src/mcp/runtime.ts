import { Layer, Logger, ManagedRuntime } from "effect";
import { McpSession } from "./mcp-session.js";

const StderrLoggerLayer = Layer.succeed(Logger.LogToStderr, true);

export const McpRuntime = ManagedRuntime.make(
  McpSession.layer.pipe(Layer.provide(StderrLoggerLayer)),
);
