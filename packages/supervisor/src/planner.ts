import * as path from "node:path";
import * as crypto from "node:crypto";
import { AcpSessionCreateError, AcpStreamError, Agent, AgentStreamOptions } from "@expect/agent";
import { NodeServices } from "@effect/platform-node";
import { Channel, Effect, FileSystem, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import { TestPlan, TestPlanJson, type TestPlanDraft } from "@expect/shared/models";
import { EXPECT_STATE_DIR } from "./constants.js";

export class PlanParseError extends Schema.ErrorClass<PlanParseError>("@supervisor/PlanParseError")(
  {
    _tag: Schema.tag("@supervisor/PlanParseError"),
    cause: Schema.Unknown,
  },
) {
  message = `Plan parse failed: ${String(this.cause)}`;
}

export class PlanningError extends Schema.ErrorClass<PlanningError>("@supervisor/PlanningError")({
  _tag: Schema.tag("@supervisor/PlanningError"),
  reason: Schema.Union([AcpStreamError, AcpSessionCreateError, PlanParseError]),
}) {
  message = `Planning failed: ${this.reason.message}`;
}

export class Planner extends ServiceMap.Service<Planner>()("@supervisor/Planner", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;
    const fs = yield* FileSystem.FileSystem;

    const parsePlanFile = Effect.fnUntraced(function* (draft: TestPlanDraft, sentinelPath: string) {
      return yield* fs.readFileString(sentinelPath).pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(TestPlanJson))),
        Effect.mapError((cause) => new PlanParseError({ cause })),
        Effect.map(
          (fields) =>
            new TestPlan({
              ...draft,
              ...fields,
            }),
        ),
      );
    });

    /**
     * @note(rasmus): uses `Channel` for emitting intermediate values (`AcpSessionUpdate`), until the plan is ready
     * and finishes with the `TestPlan`.
     *
     * @example
     * ```ts
     * // just collect the plan
     * const plan = yield* planner.plan().pipe(
     *   Channel.runDrain,
     * )
     *
     * // run code on intermediate stream chunks and collect the plan
     * const plan = yield* planner.plan(draft).pipe(
     *   Channel.runDrain,
     * )
     * const plan = yield* planner.plan(draft).pipe(
     *   Channel.runForEach(Console.log),
     * )
     * ```
     */
    const plan = Effect.fn("Planner.plan")(function* (draft: TestPlanDraft) {
      const stateDir = path.join(process.cwd(), EXPECT_STATE_DIR);
      yield* fs.makeDirectory(stateDir, { recursive: true });
      const sentinelPath = path.join(stateDir, draft.planFileName);

      return Stream.toChannel(
        agent.stream(
          new AgentStreamOptions({
            cwd: process.cwd(),
            sessionId: Option.none(),
            prompt: draft.prompt + `\n\nWrite your plan as JSON to: ${sentinelPath}`,
            systemPrompt: Option.none(),
          }),
        ),
      ).pipe(
        Channel.mapError((reason) => new PlanningError({ reason })),
        Channel.mapDoneEffect(() =>
          parsePlanFile(draft, sentinelPath).pipe(
            Effect.mapError((reason) => new PlanningError({ reason })),
          ),
        ),
      );
    }, Channel.unwrap);

    return { plan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
