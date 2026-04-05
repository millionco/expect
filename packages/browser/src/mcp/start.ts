import { Layer, Logger } from "effect";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { layerMcpServer } from "../mcp-server";
import { Artifacts } from "../artifacts";
import { DebugFileLoggerLayer, Tracing } from "@expect/shared/observability";

Layer.launch(
  layerMcpServer.pipe(
    Layer.provide(Artifacts.layer),
    Layer.provide(DebugFileLoggerLayer),
    Layer.provide(Tracing.layerAxiom("expect-mcp")),
  ),
).pipe(NodeRuntime.runMain);
