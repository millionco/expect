import { Effect, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ExecutedTestPlan, Executor, Git, Reporter, type ExecuteOptions } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import type { TestReport } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime";
import { stripUndefinedRequirement } from "../utils/strip-undefined-requirement";
import { NodeServices } from "@effect/platform-node";
import { startReplayProxy } from "../utils/replay-proxy-server";
import { toViewerRunState, pushStepState } from "../utils/push-step-state";

const LIVE_VIEW_PORT_MIN = 50000;
const LIVE_VIEW_PORT_RANGE = 10000;

const pickRandomPort = () =>
  LIVE_VIEW_PORT_MIN + Math.floor(Math.random() * LIVE_VIEW_PORT_RANGE);

interface ExecuteInput {
  readonly options: ExecuteOptions;
  readonly agentBackend: AgentBackend;
  readonly replayHost?: string;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
  readonly replayUrl?: string;
}

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

const execute = Effect.fnUntraced(
  function* (input: ExecuteInput, _ctx: Atom.FnContext) {
    const reporter = yield* Reporter;
    const executor = yield* Executor;
    const analytics = yield* Analytics;
    const git = yield* Git;

    const runStartedAt = Date.now();

    const liveViewPort = pickRandomPort();
    const liveViewUrl = `http://localhost:${liveViewPort}`;

    let replayUrl: string | undefined;

    if (input.replayHost) {
      const proxyHandle = yield* startReplayProxy({
        replayHost: input.replayHost,
        liveViewUrl,
      });
      replayUrl = `${proxyHandle.url}/replay?live=true`;

      yield* Effect.logInfo("Opening replay viewer", { replayUrl });
      yield* Effect.sync(() => {
        const { exec } = require("node:child_process") as typeof import("node:child_process");
        const escapedUrl = replayUrl!.replace(/"/g, '\\"');
        exec(`open "${escapedUrl}"`);
      });
    }

    const executeOptions: ExecuteOptions = {
      ...input.options,
      liveViewUrl,
    };

    const finalExecuted = yield* executor.execute(executeOptions).pipe(
      Stream.tap((executed) =>
        Effect.gen(function* () {
          input.onUpdate(executed);
          yield* pushStepState(liveViewUrl, toViewerRunState(executed));
        }),
      ),
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

    return { executedPlan: finalExecuted, report, replayUrl } satisfies ExecutionResult;
  },
  Effect.annotateLogs({ fn: "executeFn" }),
);

export const executeFn = cliAtomRuntime.fn<ExecuteInput>()((input, ctx) =>
  stripUndefinedRequirement(execute(input, ctx)).pipe(Effect.provide(NodeServices.layer)),
);
