import { Schema } from "effect";
import { LiveUpdatePayload } from "@expect/shared/rpcs";

const LiveUpdatePayloadJson = Schema.toCodecJson(LiveUpdatePayload);
const decodePayloads = Schema.decodeUnknownSync(Schema.Array(LiveUpdatePayloadJson));

declare global {
  interface Window {
    __EXPECT_INJECTED_EVENTS__?: unknown;
  }
}

export const __EXPECT_INJECTED_EVENTS__: readonly LiveUpdatePayload[] | undefined =
  typeof window !== "undefined" && window.__EXPECT_INJECTED_EVENTS__
    ? decodePayloads(window.__EXPECT_INJECTED_EVENTS__)
    : undefined;
