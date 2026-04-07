import { Effect, Layer } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";
import { ArtifactRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_PORT } from "@expect/shared";
import type { Artifact } from "@expect/shared/models";
import type { PlanId } from "@expect/shared/models";

const protocol = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(Socket.layerWebSocket(`ws://localhost:${LIVE_VIEWER_RPC_PORT}/rpc`)),
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const fetchAllArtifacts = (planId: PlanId): Promise<readonly Artifact[]> =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(ArtifactRpcs);
    return yield* client["artifact.GetAllArtifacts"]({ planId });
  }).pipe(Effect.scoped, Effect.provide(protocol), Effect.runPromise);
