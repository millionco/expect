import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Artifact, PlanId, TestPlan } from "../models";

const ArtifactRpcsBase = RpcGroup.make(
  Rpc.make("PushArtifacts", {
    success: Schema.Void,
    payload: {
      planId: PlanId,
      batch: Schema.Array(Artifact),
    },
  }),

  Rpc.make("StreamEvents", {
    success: Artifact,
    stream: true,
    payload: {
      planId: PlanId,
    },
  }),

  Rpc.make("GetAllArtifacts", {
    success: Schema.Array(Artifact),
    payload: {
      planId: PlanId,
    },
  }),

  Rpc.make("ListTests", {
    success: Schema.Array(TestPlan),
  }),
);

export const ArtifactRpcs = ArtifactRpcsBase.prefix("artifact.");
