import { Layer, Logger, ManagedRuntime } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Analytics, Tracing } from "@expect/shared/observability";
import { McpSession } from "./mcp-session";
import { OverlayController } from "./overlay-controller";

const StderrLoggerLayer = Layer.succeed(Logger.LogToStderr, true);

export const McpRuntime = ManagedRuntime.make(
  Layer.mergeAll(McpSession.layer, OverlayController.layer).pipe(
    Layer.provideMerge(Analytics.layerPostHog),
    Layer.provideMerge(NodeServices.layer),
    Layer.provide(StderrLoggerLayer),
    Layer.provide(Tracing.layerAxiom("expect-mcp")),
  ),
);
