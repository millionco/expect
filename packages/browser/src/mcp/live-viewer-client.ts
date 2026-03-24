import { Layer, ServiceMap } from "effect";
import { NodeSocket } from "@effect/platform-node";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import { RpcSerialization } from "effect/unstable/rpc";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_URL } from "@expect/shared";

type Client = RpcClient.RpcClient<RpcGroup.Rpcs<typeof LiveViewerRpcs>, RpcClientError>;

const protocolLayer = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(NodeSocket.layerWebSocket(LIVE_VIEWER_RPC_URL)),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class LiveViewerClient extends ServiceMap.Service<LiveViewerClient, Client>()(
  "@browser/LiveViewerClient",
) {
  static layer = Layer.effect(LiveViewerClient)(RpcClient.make(LiveViewerRpcs)).pipe(
    Layer.provide(protocolLayer),
  );
}
