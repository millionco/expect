import { Layer, Logger } from "effect";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { layerMcpServer } from "../mcp-server";
import { DebugFileLoggerLayer } from "@expect/shared/observability";

Layer.launch(
  layerMcpServer.pipe(Layer.provide(DebugFileLoggerLayer), Layer.provide(NodeServices.layer)),
).pipe(NodeRuntime.runMain);
