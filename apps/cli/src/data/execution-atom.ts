import { Effect, Option, Predicate, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ExecutedTestPlan, Executor, Git, Reporter, type ExecuteOptions } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import type { AcpConfigOption, TestReport, PlanId } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime";
import { stripUndefinedRequirement } from "../utils/strip-undefined-requirement";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { extractCloseArtifacts } from "../utils/extract-close-artifacts";

interface ExecuteInput {
  readonly options: ExecuteOptions;
  readonly agentBackend: AgentBackend;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
  readonly onConfigOptions?: (configOptions: readonly AcpConfigOption[]) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
  readonly videoUrl?: string;
}

// HACK: atom is read by testing-screen.tsx but never populated — screenshots are saved via McpSession instead
export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

const executeCore = (input: ExecuteInput) =>
  Effect.gen(function* () {
    const reporter = yield* Reporter;
    const executor = yield* Executor;
    const analytics = yield* Analytics;
    const git = yield* Git;

    yield* Effect.logInfo("Execution starting", {
      agentBackend: input.agentBackend,
      instructionLength: input.options.instruction.length,
      changesFor: input.options.changesFor._tag,
    });

    const runStartedAt = Date.now();

    const executeOptions: ExecuteOptions = {
      ...input.options,
      onConfigOptions: input.onConfigOptions,
    };

    yield* analytics.capture("run:started");

    const finalExecuted = yield* executor.execute(executeOptions).pipe(
      Stream.tap((executed) =>
        Effect.sync(() => {
          input.onUpdate(executed);
        }),
      ),
      Stream.runLast,
      Effect.map((option) =>
        (option._tag === "Some"
          ? option.value
          : new ExecutedTestPlan({
              ...input.options,
              id: "" as PlanId,
              changesFor: input.options.changesFor,
              currentBranch: "",
              diffPreview: "",
              fileStats: [],
              instruction: input.options.instruction,
              baseUrl: Option.none(),
              isHeadless: input.options.isHeadless,
              cookieBrowserKeys: input.options.cookieBrowserKeys,
              testCoverage: Option.none(),
              title: input.options.instruction,
              rationale: "Direct execution",
              steps: [],
              events: [],
            })
        )
          .finalizeTextBlock()
          .synthesizeRunFinished(),
      ),
    );

    const artifacts = extractCloseArtifacts(finalExecuted.events);

    const report = yield* reporter.report(finalExecuted);

    const passedCount = report.steps.filter(
      (step) => report.stepStatuses.get(step.id)?.status === "passed",
    ).length;
    const failedCount = report.steps.filter(
      (step) => report.stepStatuses.get(step.id)?.status === "failed",
    ).length;

    const durationMs = Date.now() - runStartedAt;

    yield* Effect.logInfo("Execution completed", {
      status: report.status,
      passedCount,
      failedCount,
      stepCount: finalExecuted.steps.length,
      durationMs,
    });

    yield* analytics.capture("run:completed", {
      passed: passedCount,
      failed: failedCount,
      step_count: finalExecuted.steps.length,
      file_count: 0,
      duration_ms: durationMs,
    });

    if (report.status === "passed") {
      yield* git.saveTestedFingerprint();
    }

    return {
      executedPlan: finalExecuted,
      report,
      videoUrl: artifacts.videoUrl,
    } satisfies ExecutionResult;
  }).pipe(Effect.withSpan("expect.session"));

export const executeFn = cliAtomRuntime.fn<ExecuteInput>()((input) =>
  stripUndefinedRequirement(executeCore(input).pipe(Effect.annotateLogs({ fn: "executeFn" }))).pipe(
    Effect.tapError((error) =>
      Effect.gen(function* () {
        const analytics = yield* Analytics;
        const errorTag =
          Predicate.isObject(error) && "_tag" in error && typeof error._tag === "string"
            ? error._tag
            : Predicate.isError(error)
              ? error.constructor.name
              : "UnknownError";
        yield* analytics.capture("run:failed", {
          error_tag: errorTag,
        });
      }).pipe(
        // HACK: analytics must never crash the run — swallow all failures from telemetry
        Effect.catchCause(() => Effect.void),
      ),
    ),
    Effect.provide(NodeServices.layer),
  ),
);
