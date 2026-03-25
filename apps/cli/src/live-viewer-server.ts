import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpStaticServer } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_PORT, LIVE_VIEWER_STATIC_PORT } from "@expect/shared";
import { LiveViewerRpcsLive, LiveViewer } from "@expect/supervisor";

const VIEWER_STATIC_DIR = join(
  dirname(fileURLToPath(import.meta.resolve("@expect/recorder"))),
  "viewer"
);

const RpcLive = RpcServer.layerHttp({
  group: LiveViewerRpcs,
  path: "/rpc",
}).pipe(Layer.provide(LiveViewerRpcsLive));

export const layerLiveViewerRpcServer = RpcLive.pipe(
  Layer.provideMerge(HttpRouter.serve(RpcLive, { disableListenLog: true })),
  Layer.provide(
    NodeHttpServer.layer(() => createServer(), { port: LIVE_VIEWER_RPC_PORT })
  ),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeServices.layer),
  Layer.provide(HttpRouter.layer),
  Layer.provide(LiveViewer.layer)
);

const StaticFilesLive = HttpStaticServer.layer({
  root: VIEWER_STATIC_DIR,
  spa: true,
});

export const layerLiveViewerStaticServer = StaticFilesLive.pipe(
  Layer.provideMerge(
    HttpRouter.serve(StaticFilesLive, { disableListenLog: true })
  ),
  Layer.provide(
    NodeHttpServer.layer(() => createServer(), {
      port: LIVE_VIEWER_STATIC_PORT,
    })
  ),
  Layer.provide(NodeServices.layer),
  Layer.provide(HttpRouter.layer)
);
