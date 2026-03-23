import {
  AcpSessionCreateError,
  AcpStreamError,
  Agent,
  AgentStreamOptions,
} from "@browser-tester/agent";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import { ExecutedTestPlan, RunStarted, type TestPlan } from "@browser-tester/shared/models";
import { NodeServices } from "@effect/platform-node";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>("@supervisor/ExecutionError")(
  {
    _tag: Schema.tag("@supervisor/ExecutionError"),
    reason: Schema.Union([AcpStreamError, AcpSessionCreateError]),
  },
) {
  message = `Execution failed: ${this.reason.message}`;
}

export class Executor extends ServiceMap.Service<Executor>()("@supervisor/Executor", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;

    const executePlan = Effect.fn("Executor.executePlan")(function* (plan: TestPlan) {
      const initial = new ExecutedTestPlan({
        ...plan,
        events: [new RunStarted({ plan })],
      });

      const streamOptions = new AgentStreamOptions({
        cwd: process.cwd(),
        sessionId: Option.none(),
        prompt: plan.prompt,
        systemPrompt: Option.none(),
      });

      return agent.stream(streamOptions).pipe(
        Stream.mapAccum(
          () => initial,
          (executed, part) => {
            const next = executed.addEvent(part);
            return [next, [next]] as const;
          },
        ),
        Stream.mapError((reason) => new ExecutionError({ reason })),
      );
    }, Stream.unwrap);

    return { executePlan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
