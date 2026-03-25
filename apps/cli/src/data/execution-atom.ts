import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ExecutedTestPlan, Executor, Git, Reporter, type ExecuteOptions } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import type { TestReport } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime";
import { stripUndefinedRequirement } from "../utils/strip-undefined-requirement";
import { NodeServices } from "@effect/platform-node";

interface ExecuteInput {
  readonly options: ExecuteOptions;
  readonly agentBackend: AgentBackend;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
}

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

const execute = Effect.fnUntraced(
  function* (input: ExecuteInput, _ctx: Atom.FnContext) {
    const reporter = yield* Reporter;
    const executor = yield* Executor;
    const analytics = yield* Analytics;
    const git = yield* Git;

    const runStartedAt = Date.now();

    const finalExecuted = yield* executor.execute(input.options).pipe(
      Stream.tap((executed) => Effect.sync(() => input.onUpdate(executed))),
      Stream.runLast,
      Effect.map((option) =>
        option._tag === "Some"
          ? option.value
          : new ExecutedTestPlan({
              ...input.options,
              id: "" as never,
              changesFor: input.options.changesFor,
              currentBranch: "",
              diffPreview: "",
              fileStats: [],
              instruction: input.options.instruction,
              baseUrl: undefined as never,
              isHeadless: input.options.isHeadless,
              requiresCookies: input.options.requiresCookies,
              title: input.options.instruction,
              rationale: "Direct execution",
              steps: [],
              events: [],
            }),
      ),
    );

    const report = yield* reporter.report(finalExecuted);

    const passedCount = report.steps.filter(
      (step) => report.stepStatuses.get(step.id)?.status === "passed",
    ).length;
    const failedCount = report.steps.filter(
      (step) => report.stepStatuses.get(step.id)?.status === "failed",
    ).length;

    yield* analytics.capture("run:completed", {
      plan_id: finalExecuted.id ?? "direct",
      passed: passedCount,
      failed: failedCount,
      step_count: finalExecuted.steps.length,
      file_count: 0,
      duration_ms: Date.now() - runStartedAt,
    });

    if (report.status === "passed") {
      yield* git.saveTestedFingerprint();
    }

    return { executedPlan: finalExecuted, report } satisfies ExecutionResult;
  },
  Effect.annotateLogs({ fn: "executeFn" }),
);

export const executeFn = cliAtomRuntime.fn<ExecuteInput>()((input, ctx) =>
  stripUndefinedRequirement(execute(input, ctx)).pipe(Effect.provide(NodeServices.layer)),
);
