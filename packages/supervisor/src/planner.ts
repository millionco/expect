import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Agent, AgentStreamOptions, ClaudeQueryError, CodexRunError } from "@browser-tester/agent";
import { Effect, Layer, Option, Result, Schema, ServiceMap, Stream } from "effect";
import {
  PlanId,
  StepId,
  TestPlan,
  TestPlanJson,
  TestPlanStep,
  type TestPlanDraft,
} from "@browser-tester/shared/models";
import { STEP_ID_PAD_LENGTH, PLANNER_MAX_STEP_COUNT, TESTIE_STATE_DIR } from "./constants.js";

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

const PLANNER_MAX_ATTEMPTS = 3;

const parsePlanFile = (
  sentinelPath: string,
  draft: TestPlanDraft,
): Effect.Effect<TestPlan, PlanParseError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.try({
      try: () => fs.readFileSync(sentinelPath, "utf-8"),
      catch: (cause) => new PlanParseError({ cause: `Could not read plan file: ${cause}` }),
    });

    const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(TestPlanJson))(raw).pipe(
      Effect.mapError((cause) => new PlanParseError({ cause: `Invalid plan JSON: ${cause}` })),
    );

    const steps = parsed.steps.slice(0, PLANNER_MAX_STEP_COUNT).map(
      (step, index) =>
        new TestPlanStep({
          id: Schema.decodeSync(StepId)(
            step.id ?? `step-${String(index + 1).padStart(STEP_ID_PAD_LENGTH, "0")}`,
          ),
          title: step.title,
          instruction: step.instruction,
          expectedOutcome: step.expectedOutcome,
          routeHint: step.routeHint ? Option.some(step.routeHint) : Option.none(),
          status: "pending",
          summary: Option.none(),
        }),
    );

    return new TestPlan({
      ...draft,
      id: Schema.decodeSync(PlanId)(parsed.id ?? `plan-${crypto.randomUUID().slice(0, 8)}`),
      title: parsed.title,
      rationale: parsed.rationale,
      steps,
    });
  });

export class Planner extends ServiceMap.Service<Planner>()("@supervisor/Planner", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;

    const plan = Effect.fn("Planner.plan")(function* (draft: TestPlanDraft) {
      const stateDir = path.join(process.cwd(), TESTIE_STATE_DIR);
      fs.mkdirSync(stateDir, { recursive: true });
      const sentinelPath = path.join(stateDir, draft.planFileName);

      const runAgent = Effect.gen(function* () {
        yield* agent
          .stream(
            new AgentStreamOptions({
              cwd: process.cwd(),
              sessionId: Option.none(),
              prompt: draft.prompt + `\n\nWrite your plan as JSON to: ${sentinelPath}`,
              systemPrompt: Option.none(),
            }),
          )
          .pipe(
            Stream.filterMap(extractTextDelta),
            Stream.runDrain,
            Effect.mapError((reason) => new PlanningError({ reason })),
          );

        return yield* parsePlanFile(sentinelPath, draft).pipe(
          Effect.mapError((reason) => new PlanningError({ reason })),
        );
      });

      return yield* Effect.retry(runAgent, {
        times: PLANNER_MAX_ATTEMPTS - 1,
      });
    });

    return { plan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
