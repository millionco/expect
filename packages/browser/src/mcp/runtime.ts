import { Layer, Logger, ManagedRuntime } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Tracing } from "@expect/shared/observability";
import { McpSession } from "./mcp-session";

const StderrLoggerLayer = Layer.succeed(Logger.LogToStderr, true);

export const McpRuntime = ManagedRuntime.make(
  McpSession.layer.pipe(
    Layer.provide(StderrLoggerLayer),
    Layer.provide(Tracing.layerAxiom("expect-mcp")),
    Layer.provide(NodeServices.layer),
  ),
);
