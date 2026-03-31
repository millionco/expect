import { describe, it, assert } from "@effect/vitest";
import { Effect, FileSystem, Layer, Option, Stream } from "effect";
import { PlanId, TestPlan, ChangesFor } from "@expect/shared/models";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";

describe("Testing", () => {
  it.effect("push writes InitialPlan to ndjson file", () => Effect.gen(function* () {}));
});
