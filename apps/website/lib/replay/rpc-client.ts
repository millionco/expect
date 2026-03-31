import { Layer, Logger, References } from "effect";
import { AtomRpc } from "effect/unstable/reactivity";
import * as Atom from "effect/unstable/reactivity/Atom";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_PORT } from "@expect/shared";

const protocol = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(Socket.layerWebSocket(`ws://localhost:${LIVE_VIEWER_RPC_PORT}/rpc`)),
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class ViewerClient extends AtomRpc.Service<ViewerClient>()("ViewerClient", {
  group: LiveViewerRpcs,
  protocol,
}) {}

const ViewerLive = ViewerClient.layer.pipe(
  Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Error")),
  Layer.provideMerge(Logger.layer([Logger.consolePretty()])),
);

export const ViewerRuntime = Atom.runtime(ViewerLive);
