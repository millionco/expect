import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Agent } from "@browser-tester/agent";
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
      console.error("[execution-atom] starting execution for:", input.testPlan.title);
      Atom.set(screenshotPathsAtom, []);

      const executor = yield* Executor;
      console.error("[execution-atom] got executor, calling executePlan...");

      const finalExecuted = yield* executor.executePlan(input.testPlan).pipe(
        Stream.tap((executed) =>
          Effect.sync(() => {
            input.onUpdate(executed);
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
        Effect.provide(Agent.layerFor(input.agentBackend)),
      );

      console.error("[execution-atom] stream complete, total events:", finalExecuted.events.length);

      const report = yield* reporter.report(finalExecuted);
      console.error("[execution-atom] report done, status:", report.status);

      if (report.status === "passed") {
        const git = yield* Git;
        yield* git.saveTestedFingerprint();
      }

      return { executedPlan: finalExecuted, report } satisfies ExecutionResult;
    },
    Effect.annotateLogs({ fn: "executePlanFn" }),
  ),
);
