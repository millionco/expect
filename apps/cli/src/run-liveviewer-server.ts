import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
import { HttpRouter, HttpStaticServer } from "effect/unstable/http";
import { LIVE_VIEWER_STATIC_PORT } from "@expect/shared";

const VIEWER_STATIC_DIR = join(
  dirname(fileURLToPath(import.meta.resolve("@expect/recorder"))),
  "viewer"
);

console.log(`Static dir: ${VIEWER_STATIC_DIR}`);

const StaticFilesLive = HttpStaticServer.layer({
  root: VIEWER_STATIC_DIR,
  spa: true,
});

const ServerLive = StaticFilesLive.pipe(
  Layer.provideMerge(
    HttpRouter.serve(StaticFilesLive, { disableListenLog: false })
  ),
  Layer.provide(
    NodeHttpServer.layer(() => createServer(), {
      port: LIVE_VIEWER_STATIC_PORT,
    })
  ),
  Layer.provide(NodeServices.layer),
  Layer.provide(HttpRouter.layer)
);

console.log(
  `Starting live viewer static server on http://localhost:${LIVE_VIEWER_STATIC_PORT}`
);

NodeRuntime.runMain(Layer.launch(ServerLive));
