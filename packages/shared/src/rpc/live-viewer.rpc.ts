import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { AcpSessionUpdate, PlanId, TestPlan } from "../models";

export const RrwebEvent = Schema.Unknown;

export const LiveUpdatePayload = Schema.Union([
  Schema.TaggedStruct("RrwebBatch", {
    events: Schema.Array(RrwebEvent),
  }),
  Schema.TaggedStruct("InitialPlan", {
    plan: TestPlan,
  }),
  Schema.TaggedStruct("SessionUpdate", {
    update: AcpSessionUpdate,
  }),
  Schema.TaggedStruct("Done", {}),
]);
export type LiveUpdatePayload = typeof LiveUpdatePayload.Type;

const LiveViewerRpcsBase = RpcGroup.make(
  Rpc.make("PushRrwebEvents", {
    success: Schema.Void,
    payload: {
      planId: PlanId,
      events: Schema.Array(RrwebEvent),
    },
  }),

  Rpc.make("StreamEvents", {
    success: LiveUpdatePayload,
    stream: true,
    payload: {
      planId: PlanId,
    },
  }),

  Rpc.make("ListTests", {
    success: Schema.Array(TestPlan),
  }),
);

export const LiveViewerRpcs = LiveViewerRpcsBase.prefix("liveViewer.");
