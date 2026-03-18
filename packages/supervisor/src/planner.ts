import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Agent, AgentStreamOptions, ClaudeQueryError, CodexRunError } from "@browser-tester/agent";
import { Effect, Layer, Option, Result, Schema, ServiceMap, Stream } from "effect";
import { PlanId, TestPlan, type TestPlanDraft } from "@browser-tester/shared/models";

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
  reason: Schema.Union([ClaudeQueryError, CodexRunError, PlanParseError]),
}) {
  message = `Planning failed: ${this.reason.message}`;
}

const extractTextDelta = (
  part: LanguageModelV3StreamPart,
): Result.Result<string, LanguageModelV3StreamPart> =>
  part.type === "text-delta" ? Result.succeed(part.delta) : Result.fail(part);

// HACK: mock plan — replace with real JSON parsing once agent output is stable
const parsePlanFromText = (
  _text: string,
  draft: TestPlanDraft,
): Effect.Effect<TestPlan, PlanParseError> =>
  Effect.succeed(
    new TestPlan({
      ...draft,
      id: Schema.decodeSync(PlanId)("plan-mock"),
      title: "Mock plan",
      rationale: "Placeholder until planner is implemented.",
      steps: [],
    }),
  );

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
