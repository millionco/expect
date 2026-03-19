import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ExecutedTestPlan, Executor, Reporter } from "@browser-tester/supervisor";
import type { TestPlan, TestReport } from "@browser-tester/shared/models";
import { cliAtomRuntime } from "./runtime.js";

interface ExecutePlanInput {
  readonly testPlan: TestPlan;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
}

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

export const executePlanFn = cliAtomRuntime.fn(
  Effect.fnUntraced(
    function* (input: ExecutePlanInput, _ctx: Atom.FnContext) {
      Atom.set(screenshotPathsAtom, []);

      const executor = yield* Executor;
      // HACK: Effect v4 beta loses Stream element type through ServiceMap.Service inference
      const executionStream = (yield* executor.executePlan(
        input.testPlan,
      )) as Stream.Stream<ExecutedTestPlan>;

      const finalExecuted = yield* executionStream.pipe(
        Stream.tap((executed) =>
          Effect.sync(() => {
            const lastEvent = executed.events.at(-1);
            if (lastEvent?._tag === "ToolResult" && lastEvent.toolName.endsWith("__screenshot")) {
              Atom.update(screenshotPathsAtom, (previous) => [...previous, lastEvent.result]);
            }
          }),
        ),
        Stream.runLast,
        Effect.map((option) =>
          option._tag === "Some"
            ? option.value
            : new ExecutedTestPlan({ ...input.testPlan, events: [] }),
        ),
      );

      const reporter = yield* Reporter;
      const report = yield* reporter.report(finalExecuted);

      return { executedPlan: finalExecuted, report } satisfies ExecutionResult;
    },
    Effect.annotateLogs({ fn: "executePlanFn" }),
  ),
);
