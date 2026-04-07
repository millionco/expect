import { Schema } from "effect";
import { Artifact } from "@expect/shared/models";

const ArtifactJson = Schema.toCodecJson(Artifact);
const decodeArtifacts = Schema.decodeUnknownSync(Schema.Array(ArtifactJson));

declare global {
  interface Window {
    __EXPECT_INJECTED_EVENTS__?: unknown;
  }
}

export const __EXPECT_INJECTED_EVENTS__: readonly Artifact[] | undefined =
  typeof window !== "undefined" && window.__EXPECT_INJECTED_EVENTS__
    ? decodeArtifacts(window.__EXPECT_INJECTED_EVENTS__)
    : undefined;
