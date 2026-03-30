import { Effect, Option, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ExecutedTestPlan, Executor, Git, Reporter, type ExecuteOptions } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import type { AcpConfigOption, TestReport } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime";
import { stripUndefinedRequirement } from "../utils/strip-undefined-requirement";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { startReplayProxy } from "../utils/replay-proxy-server";
import { toViewerRunState, pushStepState } from "../utils/push-step-state";
import { extractCloseArtifacts } from "../utils/extract-close-artifacts";
import { loadReplayEvents } from "../utils/load-replay-events";

const LIVE_VIEW_PORT_MIN = 50000;
const LIVE_VIEW_PORT_RANGE = 10000;

const pickRandomPort = () => LIVE_VIEW_PORT_MIN + Math.floor(Math.random() * LIVE_VIEW_PORT_RANGE);

interface ExecuteInput {
  readonly options: ExecuteOptions;
  readonly agentBackend: AgentBackend;
  readonly replayHost?: string;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
  readonly onReplayUrl?: (url: string) => void;
  readonly onConfigOptions?: (configOptions: readonly AcpConfigOption[]) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
  readonly replayUrl?: string;
  readonly localReplayUrl?: string;
  readonly videoUrl?: string;
}

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

const syncReplayProxy = Effect.fn("syncReplayProxy")(function* (
  replayUrl: string | undefined,
  liveViewUrl: string,
  replaySessionPath: string | undefined,
  executed: ExecutedTestPlan,
) {
  if (!replayUrl) return;

  const proxyBase = replayUrl.split("/replay")[0];
  const replayEvents = yield* loadReplayEvents({ liveViewUrl, replaySessionPath });

  if (replayEvents && replayEvents.length > 0) {
    yield* Effect.tryPromise(() =>
      fetch(`${proxyBase}/latest.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replayEvents),
      }),
    ).pipe(Effect.catchCause(() => Effect.void));
  }

  yield* pushStepState(proxyBase, toViewerRunState(executed));
});

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
      replayUrl = `${proxyHandle.url}/replay`;

      yield* Effect.logInfo("Replay viewer available", { replayUrl });
      yield* Effect.sync(() => input.onReplayUrl?.(`${replayUrl}?live=true`));
    }

    const executeOptions: ExecuteOptions = {
      ...input.options,
      liveViewUrl,
      onConfigOptions: input.onConfigOptions,
    };

    yield* analytics.capture("run:started", { plan_id: "direct" });

    const finalExecuted = yield* executor.execute(executeOptions).pipe(
      Stream.tap((executed) =>
        Effect.gen(function* () {
          input.onUpdate(executed);
          yield* pushStepState(liveViewUrl, toViewerRunState(executed));
        }),
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

    yield* syncReplayProxy(replayUrl, liveViewUrl, artifacts.replaySessionPath, finalExecuted);

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

    return {
      executedPlan: finalExecuted,
      report,
      replayUrl: replayUrl ?? artifacts.localReplayUrl,
      localReplayUrl: artifacts.localReplayUrl,
      videoUrl: artifacts.videoUrl,
    } satisfies ExecutionResult;
  },
  Effect.annotateLogs({ fn: "executeFn" }),
);

export const executeFn = cliAtomRuntime.fn<ExecuteInput>()((input, ctx) =>
  stripUndefinedRequirement(execute(input, ctx)).pipe(
    Effect.tapError((error) =>
      Effect.gen(function* () {
        const analytics = yield* Analytics;
        const errorTag = error instanceof Error ? error.constructor.name : "UnknownError";
        yield* analytics.capture("run:failed", {
          plan_id: "direct",
          error_tag: errorTag,
        });
      }).pipe(Effect.catchCause(() => Effect.void)),
    ),
    Effect.provide(NodeServices.layer),
  ),
);

const executeAtom = Effect.fnUntraced(
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
      replayUrl = `${proxyHandle.url}/replay`;

      yield* Effect.logInfo("Replay viewer available", { replayUrl });
      yield* Effect.sync(() => input.onReplayUrl?.(`${replayUrl}?live=true`));
    }

    const executeOptions: ExecuteOptions = {
      ...input.options,
      liveViewUrl,
      onConfigOptions: input.onConfigOptions,
    };

    yield* analytics.capture("run:started", { plan_id: "direct" });

    const finalExecuted = yield* executor.execute(executeOptions).pipe(
      Stream.tap((executed) =>
        Effect.gen(function* () {
          input.onUpdate(executed);
          yield* pushStepState(liveViewUrl, toViewerRunState(executed));
        }),
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

    yield* syncReplayProxy(replayUrl, liveViewUrl, artifacts.replaySessionPath, finalExecuted);

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

    return {
      executedPlan: finalExecuted,
      report,
      replayUrl: replayUrl ?? artifacts.localReplayUrl,
      localReplayUrl: artifacts.localReplayUrl,
      videoUrl: artifacts.videoUrl,
    } satisfies ExecutionResult;
  },
  Effect.annotateLogs({ fn: "executeAtomFn" }),
  Effect.provide(NodeServices.layer),
);

export const executeAtomFn = cliAtomRuntime.fn(executeAtom);
