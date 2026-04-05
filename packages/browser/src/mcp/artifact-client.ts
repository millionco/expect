import { Layer, ServiceMap, Effect } from "effect";
import { NodeSocket } from "@effect/platform-node";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import { RpcSerialization } from "effect/unstable/rpc";
import { ArtifactRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_URL } from "@expect/shared";

type Client = RpcClient.RpcClient<RpcGroup.Rpcs<typeof ArtifactRpcs>, RpcClientError>;

const protocolLayer = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(NodeSocket.layerWebSocket(LIVE_VIEWER_RPC_URL)),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class ArtifactClient extends ServiceMap.Service<ArtifactClient, Client>()(
  "@browser/ArtifactClient",
) {
  static layer = Layer.effect(ArtifactClient)(RpcClient.make(ArtifactRpcs)).pipe(
    Layer.provide(protocolLayer),
  );
}
