import { Config, Effect, Option, Stream } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Agent } from "@browser-tester/agent";
import { ExecutedTestPlan, Executor, Git, Reporter } from "@browser-tester/supervisor";
import { createViewerClient, type ViewerRunState } from "@browser-tester/videogen";
import type { AgentBackend } from "@browser-tester/agent";
import type { TestPlan, TestReport } from "@browser-tester/shared/models";
import { cliAtomRuntime } from "./runtime.js";

const VIEWER_URL_ENV = "BROWSER_TESTER_VIEWER_URL";
const RUN_ID_ENV = "BROWSER_TESTER_RUN_ID";

interface ExecutePlanInput {
  readonly testPlan: TestPlan;
  readonly agentBackend: AgentBackend;
  readonly onUpdate: (executed: ExecutedTestPlan) => void;
}

export interface ExecutionResult {
  readonly executedPlan: ExecutedTestPlan;
  readonly report: TestReport;
}

const toRunState = (executed: ExecutedTestPlan, overrides?: Partial<ViewerRunState>) => ({
  title: executed.title,
  status: "running" as const,
  summary: undefined as string | undefined,
  ...overrides,
  steps: executed.steps.map((step) => ({
    stepId: step.id,
    title: step.title,
    status: step.status,
    summary: Option.getOrUndefined(step.summary),
  })),
});

export const screenshotPathsAtom = Atom.make<readonly string[]>([]);

export const executePlanFn = cliAtomRuntime.fn(
  Effect.fnUntraced(
    function* (input: ExecutePlanInput, _ctx: Atom.FnContext) {
      const reporter = yield* Reporter;
      console.error("[execution-atom] starting execution for:", input.testPlan.title);
      Atom.set(screenshotPathsAtom, []);

      const viewerUrl = yield* Config.option(Config.string(VIEWER_URL_ENV));
      const runId = yield* Config.option(Config.string(RUN_ID_ENV));
      const viewer = Option.isSome(viewerUrl)
        ? createViewerClient(
            viewerUrl.value,
            Option.isSome(runId) ? runId.value : crypto.randomUUID(),
          )
        : undefined;

      const executor = yield* Executor;
      console.error("[execution-atom] got executor, calling executePlan...");

      const finalExecuted = yield* executor.executePlan(input.testPlan).pipe(
        Stream.tap((executed) =>
          Effect.gen(function* () {
            input.onUpdate(executed);
            if (viewer) {
              yield* viewer.pushRunState(toRunState(executed));
            }
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

      if (viewer) {
        yield* viewer.pushRunState(
          toRunState(finalExecuted, {
            status: report.status,
            summary: report.summary,
          }),
        );
      }

      if (report.status === "passed") {
        const git = yield* Git;
        yield* git.saveTestedFingerprint();
      }

      return { executedPlan: finalExecuted, report } satisfies ExecutionResult;
    },
    Effect.annotateLogs({ fn: "executePlanFn" }),
  ),
);
