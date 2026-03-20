import {
  Agent,
  AgentStreamOptions,
  ClaudeQueryError,
  CodexRunError,
} from "@browser-tester/agent";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import {
  ExecutedTestPlan,
  ExecutionEvent,
  RunFinished,
  RunStarted,
  StepCompleted,
  StepFailed,
  StepId,
  StepStarted,
  type TestPlan,
} from "@browser-tester/shared/models";
import { NodeServices } from "@effect/platform-node";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>(
  "@supervisor/ExecutionError"
)({
  _tag: Schema.tag("@supervisor/ExecutionError"),
  reason: Schema.Union([ClaudeQueryError, CodexRunError]),
}) {
  message = `Execution failed: ${this.reason.message}`;
}

const parseMarker = (line: string): ExecutionEvent | null => {
  const pipeIndex = line.indexOf("|");
  if (pipeIndex === -1) return null;

  const marker = line.slice(0, pipeIndex);
  const rest = line.slice(pipeIndex + 1);
  const secondPipeIndex = rest.indexOf("|");
  const first = secondPipeIndex === -1 ? rest : rest.slice(0, secondPipeIndex);
  const second = secondPipeIndex === -1 ? "" : rest.slice(secondPipeIndex + 1);

  if (marker === "STEP_START") {
    return new StepStarted({
      stepId: Schema.decodeSync(StepId)(first),
      title: second,
    });
  }
  if (marker === "STEP_DONE") {
    return new StepCompleted({
      stepId: Schema.decodeSync(StepId)(first),
      summary: second,
    });
  }
  if (marker === "ASSERTION_FAILED") {
    return new StepFailed({
      stepId: Schema.decodeSync(StepId)(first),
      message: second,
    });
  }
  if (marker === "RUN_COMPLETED") {
    const status = Schema.decodeSync(
      Schema.Literals(["passed", "failed"] as const)
    )(first === "failed" ? "failed" : "passed");
    return new RunFinished({ status, summary: second });
  }

  return null;
};

export class Executor extends ServiceMap.Service<Executor>()(
  "@supervisor/Executor",
  {
    make: Effect.gen(function* () {
      const agent = yield* Agent;

      const executePlan = Effect.fn("Executor.executePlan")(function* (
        plan: TestPlan
      ) {
        const initial = new ExecutedTestPlan({
          ...plan,
          events: [new RunStarted({ plan })],
        });

        return agent
          .stream(
            new AgentStreamOptions({
              cwd: process.cwd(),
              sessionId: Option.none(),
              prompt: plan.prompt,
              systemPrompt: Option.none(),
            })
          )
          .pipe(
            Stream.mapAccum(
              () => initial,
              (executed, part) => {
                const next = executed.addEvent(part);
                return [next, [next]] as const;
              }
            ),
            Stream.mapError((reason) => new ExecutionError({ reason }))
          );
      },
      Stream.unwrap);

      return { executePlan } as const;
    }),
  }
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(NodeServices.layer)
  );
}
