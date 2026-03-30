import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node";
import { HttpRouter, HttpStaticServer } from "effect/unstable/http";
import { LIVE_VIEWER_STATIC_PORT } from "@expect/shared";
import { Git, LiveViewer } from "@expect/supervisor";
import { layerLiveViewerRpcServer, layerLiveViewerStaticServer } from "./live-viewer-server";

const VIEWER_STATIC_DIR = join(
  dirname(fileURLToPath(import.meta.resolve("@expect/recorder"))),
  "viewer",
);

console.log(`Static dir: ${VIEWER_STATIC_DIR}`);

const gitLayer = Git.withRepoRoot(process.cwd());
const liveViewerLayer = LiveViewer.layer.pipe(Layer.provide(gitLayer));
const LiveViewerLive = Layer.mergeAll(
  layerLiveViewerRpcServer.pipe(Layer.provide(liveViewerLayer)),
  layerLiveViewerStaticServer,
);

console.log(`Starting live viewer static server on http://localhost:${LIVE_VIEWER_STATIC_PORT}`);

NodeRuntime.runMain(Layer.launch(LiveViewerLive));
