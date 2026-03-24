import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ExecutionEvent } from "../models";

export const RrwebEvent = Schema.Unknown;

export const LiveUpdatePayload = Schema.Union([
  Schema.TaggedStruct("RrwebBatch", {
    events: Schema.Array(RrwebEvent),
  }),
  Schema.TaggedStruct("Execution", {
    event: ExecutionEvent,
  }),
]);
export type LiveUpdatePayload = typeof LiveUpdatePayload.Type;

const LiveViewerRpcsBase = RpcGroup.make(
  Rpc.make("PushRrwebEvents", {
    success: Schema.Void,
    payload: {
      events: Schema.Array(RrwebEvent),
    },
  }),

  Rpc.make("StreamEvents", {
    success: LiveUpdatePayload,
    stream: true,
  }),
);

export const LiveViewerRpcs = LiveViewerRpcsBase.prefix("liveViewer.");
