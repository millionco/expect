import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ExecutedTestPlan, Executor, Git, Reporter } from "@browser-tester/supervisor";
import type { AgentBackend } from "@browser-tester/agent";
import type { TestPlan, TestReport } from "@browser-tester/shared/models";
import { cliAtomRuntime } from "./runtime.js";

interface ExecutePlanInput {
  readonly testPlan: TestPlan;
  readonly agentBackend: AgentBackend;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
}

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

export const executePlanFn = cliAtomRuntime.fn(
  Effect.fnUntraced(
    function* (input: ExecutePlanInput, _ctx: Atom.FnContext) {
      const reporter = yield* Reporter;
      const executor = yield* Executor;

      const finalExecuted = yield* executor.executePlan(input.testPlan).pipe(
        Stream.tap((executed) => Effect.sync(() => input.onUpdate(executed))),
        Stream.runLast,
        Effect.map((option) =>
          option._tag === "Some"
            ? option.value
            : new ExecutedTestPlan({ ...input.testPlan, events: [] }),
        ),
      );

      const report = yield* reporter.report(finalExecuted);

      if (report.status === "passed") {
        const git = yield* Git;
        yield* git.saveTestedFingerprint();
      }

      return { executedPlan: finalExecuted, report } satisfies ExecutionResult;
    },
    Effect.annotateLogs({ fn: "executePlanFn" }),
  ),
);
