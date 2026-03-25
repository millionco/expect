import {
  AcpSessionCreateError,
  AcpStreamError,
  Agent,
  AgentStreamOptions,
} from "@expect/agent";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import {
  ExecutedTestPlan,
  RunStarted,
  type TestPlan,
} from "@expect/shared/models";
import { NodeServices } from "@effect/platform-node";
import { LiveViewer } from "./live-viewer";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>(
  "@supervisor/ExecutionError"
)({
  _tag: Schema.tag("@supervisor/ExecutionError"),
  reason: Schema.Union([AcpStreamError, AcpSessionCreateError]),
}) {
  message = `Execution failed: ${this.reason.message}`;
}

export class Executor extends ServiceMap.Service<Executor>()(
  "@supervisor/Executor",
  {
    make: Effect.gen(function* () {
      const agent = yield* Agent;
      const liveViewer = yield* LiveViewer;

      const executePlan = Effect.fn("Executor.executePlan")(function* (
        plan: TestPlan
      ) {
        const initial = new ExecutedTestPlan({
          ...plan,
          events: [new RunStarted({ plan })],
        });
        yield* liveViewer.push({ _tag: "PlanUpdate", plan: initial });

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
              /* console.log("PART:  ");
              console.dir(part, { depth: null }); */
              const next = executed.addEvent(part);
              /* console.log("NEXT:  ");
              console.dir(next.events, { depth: null });
              console.log(
                " --- --- --- --- --- --- --- --- ---  --- --- --- --- --- --- --- --- ---  --- --- --- --- --- --- --- --- --- "
                ); */
              return [next, [next]] as const;
            }
          ),
          Stream.tap(() => Effect.logFatal(`Pushing Plan Update`)),
          Stream.tap((plan) => liveViewer.push({ _tag: "PlanUpdate", plan })),
          Stream.mapError((reason) => new ExecutionError({ reason }))
        );
      },
      Stream.unwrap);

      return { executePlan } as const;
    }),
  }
) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(LiveViewer.layer),
    Layer.provide(NodeServices.layer)
  );
}
