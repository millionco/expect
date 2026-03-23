import { Config, Effect, Option, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Agent } from "@browser-tester/agent";
import {
  ExecutedTestPlan,
  Executor,
  Git,
  Reporter,
} from "@browser-tester/supervisor";
import type { AgentBackend } from "@browser-tester/agent";
import type { TestPlan, TestReport } from "@browser-tester/shared/models";
const LIVE_VIEW_URL_ENV_NAME = "BROWSER_TESTER_LIVE_VIEW_URL";
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

interface LiveViewStepState {
  readonly title: string;
  readonly status: "running" | "passed" | "failed";
  readonly summary: string | undefined;
  readonly steps: ReadonlyArray<{
    readonly stepId: string;
    readonly title: string;
    readonly status: "pending" | "active" | "passed" | "failed";
    readonly summary: string | undefined;
  }>;
}

const toLiveViewStepState = (
  executed: ExecutedTestPlan,
  overrides?: Partial<LiveViewStepState>,
): LiveViewStepState => ({
  title: executed.title,
  status: "running",
  summary: undefined,
  ...overrides,
  steps: executed.steps.map((step) => ({
    stepId: step.id,
    title: step.title,
    status: step.status,
    summary: Option.getOrUndefined(step.summary),
  })),
});

const pushStepStateToLiveView = (liveViewUrl: string, state: LiveViewStepState) =>
  Effect.tryPromise({
    try: () =>
      fetch(`${liveViewUrl}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      }),
    catch: () => undefined,
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("Failed to push step state to live view", { cause }),
    ),
  );

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

export const executePlanFn = cliAtomRuntime.fn(
  Effect.fnUntraced(function* (input: ExecutePlanInput, _ctx: Atom.FnContext) {
    const reporter = yield* Reporter;
    const executor = yield* Executor;

    const finalExecuted = yield* executor.executePlan(input.testPlan).pipe(
      Stream.tap((executed) =>
        Effect.sync(() => {
          input.onUpdate(executed);
        })
      ),
      Stream.runLast,
      Effect.map((option) =>
        option._tag === "Some"
          ? option.value
          : new ExecutedTestPlan({ ...input.testPlan, events: [] })
      ),
      Effect.provide(Agent.layerFor(input.agentBackend))
    );

    const report = yield* reporter.report(finalExecuted);

    if (report.status === "passed") {
      const git = yield* Git;
      yield* git.saveTestedFingerprint();
    }

    return { executedPlan: finalExecuted, report } satisfies ExecutionResult;
  }, Effect.annotateLogs({ fn: "executePlanFn" }))
);
