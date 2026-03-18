import { Agent, AgentStreamOptions, ClaudeQueryError, CodexRunError } from "@browser-tester/agent";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Effect, Layer, Option, Result, Schema, ServiceMap, Stream } from "effect";
import { PLANNER_MAX_STEP_COUNT, STEP_ID_PAD_LENGTH } from "./constants.js";
import { extractJsonObject } from "./json.js";
import {
  PlanId,
  StepId,
  TestPlan,
  TestPlanStep,
  type TestPlanDraft,
} from "./models.js";

export class PlanParseError extends Schema.ErrorClass<PlanParseError>("@supervisor/PlanParseError")({
  _tag: Schema.tag("@supervisor/PlanParseError"),
  cause: Schema.Unknown,
}) {
  message = `Plan parse failed: ${String(this.cause)}`;
}

export class PlanningError extends Schema.ErrorClass<PlanningError>("@supervisor/PlanningError")({
  _tag: Schema.tag("@supervisor/PlanningError"),
  reason: Schema.Union([ClaudeQueryError, CodexRunError, PlanParseError]),
}) {
  message = `Planning failed: ${this.reason.message}`;
}

const extractTextDelta = (
  part: LanguageModelV3StreamPart,
): Result.Result<string, LanguageModelV3StreamPart> =>
  part.type === "text-delta" ? Result.succeed(part.delta) : Result.fail(part);

const PlanStepJson = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.optional(Schema.NullOr(Schema.String)),
});

const TestPlanJson = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  rationale: Schema.String,
  steps: Schema.Array(PlanStepJson),
});

const parsePlanFromText = (
  text: string,
  draft: TestPlanDraft,
): Effect.Effect<TestPlan, PlanParseError> =>
  Effect.gen(function* () {
    const rawJson = yield* Effect.try({
      try: () => JSON.parse(extractJsonObject(text)),
      catch: (cause) => new PlanParseError({ cause }),
    });

    const decoded = yield* Schema.decodeUnknownEffect(TestPlanJson)(rawJson).pipe(
      Effect.mapError((cause) => new PlanParseError({ cause })),
    );

    if (decoded.steps.length === 0 || decoded.steps.length > PLANNER_MAX_STEP_COUNT) {
      return yield* new PlanParseError({
        cause: `Expected between 1 and ${PLANNER_MAX_STEP_COUNT} steps, got ${decoded.steps.length}.`,
      });
    }

    const planId = Schema.decodeSync(PlanId)(
      decoded.id ?? `plan-${Date.now().toString(36)}`,
    );

    const steps = decoded.steps.map(
      (step, index) =>
        new TestPlanStep({
          id: Schema.decodeSync(StepId)(
            step.id ?? `step-${String(index + 1).padStart(STEP_ID_PAD_LENGTH, "0")}`,
          ),
          title: step.title,
          instruction: step.instruction,
          expectedOutcome: step.expectedOutcome,
          routeHint: step.routeHint ? Option.some(step.routeHint) : Option.none(),
        }),
    );

    return new TestPlan({
      ...draft,
      id: planId,
      title: decoded.title,
      rationale: decoded.rationale,
      steps,
    });
  });

export class Planner extends ServiceMap.Service<Planner>()("@supervisor/Planner", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;

    const plan = Effect.fn("Planner.plan")(function* (draft: TestPlanDraft) {
      const text = yield* agent
        .stream(
          new AgentStreamOptions({
            cwd: process.cwd(),
            sessionId: Option.none(),
            prompt: draft.prompt,
            systemPrompt: Option.none(),
          }),
        )
        .pipe(
          Stream.filterMap(extractTextDelta),
          Stream.runFold(
            () => "",
            (accumulated, chunk) => accumulated + chunk,
          ),
          Effect.mapError((reason) => new PlanningError({ reason })),
        );

      return yield* parsePlanFromText(text, draft).pipe(
        Effect.mapError((reason) => new PlanningError({ reason })),
      );
    });

    return { plan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
