import { Effect, Option, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import {
  ExecutedTestPlan,
  Executor,
  Git,
  Reporter,
  type ExecuteOptions,
} from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import { LIVE_VIEWER_STATIC_URL } from "@expect/shared";
import type { AgentBackend } from "@expect/agent";
import type { AcpConfigOption, TestReport } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime";

const REPLAY_REPORT_PREFIX = "rrweb report:";
const PLAYWRIGHT_VIDEO_PREFIX = "Playwright video:";

const artifactViewerUrl = (planId: string) =>
  `${LIVE_VIEWER_STATIC_URL}/replay/?testId=${planId}`;

interface ExecuteInput {
  readonly options: ExecuteOptions;
  readonly agentBackend: AgentBackend;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
  readonly onReplayUrl?: (url: string) => void;
  readonly onConfigOptions?: (
    configOptions: readonly AcpConfigOption[]
  ) => void;
  readonly onLiveViewUrl?: (url: string) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
  readonly replayUrl?: string;
  readonly localReplayUrl?: string;
  readonly videoUrl?: string;
}

// HACK: atom is read by testing-screen.tsx but never populated — screenshots are saved via McpSession instead
export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

export const executeAtomFn = cliAtomRuntime.fn(
  Effect.fnUntraced(
    function* (input: ExecuteInput, _ctx: Atom.FnContext) {
      const reporter = yield* Reporter;
      const executor = yield* Executor;
      const analytics = yield* Analytics;
      const git = yield* Git;

      const runStartedAt = Date.now();

      yield* analytics.capture("run:started", { plan_id: "direct" });

      const finalExecuted = yield* executor.execute(input.options).pipe(
        Stream.tap((executed) =>
          Effect.sync(() => {
            input.onUpdate(executed);
          })
        ),
        Stream.runLast,
        Effect.map((option) =>
          (option._tag === "Some"
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
                cookieImportProfiles: input.options.cookieImportProfiles,
                testCoverage: Option.none(),
                title: input.options.instruction,
                rationale: "Direct execution",
                steps: [],
                events: [],
              })
          )
            .finalizeTextBlock()
            .synthesizeRunFinished()
        )
      );

      const report = yield* reporter.report(finalExecuted);

      const passedCount = report.steps.filter(
        (step) => report.stepStatuses.get(step.id)?.status === "passed"
      ).length;
      const failedCount = report.steps.filter(
        (step) => report.stepStatuses.get(step.id)?.status === "failed"
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

      return {
        executedPlan: finalExecuted,
        report,
        replayUrl: artifactViewerUrl(finalExecuted.id),
      } satisfies ExecutionResult;
    },
    Effect.annotateLogs({ fn: "executeAtomFn" }),
    Effect.withSpan("expect.session")
  )
);
