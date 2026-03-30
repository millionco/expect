import { Config, Effect, Layer, PubSub, ServiceMap, Stream } from "effect";
import { NodeSocket } from "@effect/platform-node";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import { RpcSerialization } from "effect/unstable/rpc";
import { PlanId, type Artifact } from "@expect/shared/models";
import { LiveViewerRpcs } from "@expect/shared/rpcs";
import { LIVE_VIEWER_RPC_URL } from "@expect/shared";
import { Artifacts } from "./artifacts";

const protocolLayer = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(NodeSocket.layerWebSocket(LIVE_VIEWER_RPC_URL)),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const layerArtifactsRpc = Layer.effect(Artifacts)(
  Effect.gen(function* () {
    const rpcClient = yield* RpcClient.make(LiveViewerRpcs);
    const planIdString = yield* Config.string("EXPECT_PLAN_ID");
    const planId = PlanId.makeUnsafe(planIdString);
    const items: Artifact[] = [];
    const pubsub = yield* PubSub.unbounded<Artifact>();

    const push = Effect.fn("Artifacts.push")(function* (...artifacts: Artifact[]) {
      const rrwebEvents: unknown[] = [];

      for (const artifact of artifacts) {
        items.push(artifact);
        yield* PubSub.publish(pubsub, artifact);
        if (artifact._tag === "RrwebEvent") {
          rrwebEvents.push(artifact.event);
        }
      }

      if (rrwebEvents.length > 0) {
        // rrweb events contain `undefined` values which JSON can't serialize —
        // round-trip through JSON.parse(JSON.stringify(...)) to strip them
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
    });

    const stream = Stream.fromPubSub(pubsub);

    const all = () => items as readonly Artifact[];

    return { push, stream, all } as const;
  }),
).pipe(Layer.provide(protocolLayer));
