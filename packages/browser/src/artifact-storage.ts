import { Config, Effect, Layer, ServiceMap } from "effect";
import { NodeSocket } from "@effect/platform-node";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import { RpcSerialization } from "effect/unstable/rpc";
import { PlanId, type Artifact } from "@expect/shared/models";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_URL } from "@expect/shared";

export class ArtifactStorage extends ServiceMap.Service<
  ArtifactStorage,
  {
    readonly push: (artifacts: readonly Artifact[]) => Effect.Effect<void>;
  }
>()("@browser/ArtifactStorage") {
  static layerNoop = Layer.succeed(this, {
    push: () => Effect.void,
  });

  static layerRpc = Layer.effect(this)(
    Effect.gen(function* () {
      const rpcClient = yield* RpcClient.make(LiveViewerRpcs);
      const planIdString = yield* Config.string("EXPECT_PLAN_ID");
      const planId = PlanId.makeUnsafe(planIdString);

      return {
        push: (artifacts) =>
          Effect.gen(function* () {
            const rrwebEvents: unknown[] = [];
            for (const artifact of artifacts) {
              if (artifact._tag === "RrwebEvent") {
                rrwebEvents.push(artifact.event);
              }
            }

            if (rrwebEvents.length > 0) {
              const sanitized = JSON.parse(JSON.stringify(rrwebEvents)) as unknown[];
              yield* rpcClient["liveViewer.PushRrwebEvents"]({
                planId,
                events: sanitized,
              }).pipe(
                Effect.ignore({
                  message: "Failed to push rrweb events to live viewer",
                  log: "Warn",
                }),
              );
            }
          }),
      };
    }),
  ).pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket().pipe(
        Layer.provide(NodeSocket.layerWebSocket(LIVE_VIEWER_RPC_URL)),
        Layer.provide(RpcSerialization.layerNdjson),
      ),
    ),
  );
}
