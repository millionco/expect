import { Cause, Effect, Stream } from "effect";
import {
  ChangesFor,
  Executor,
  ExecutedTestPlan,
  Git,
  Planner,
  Reporter,
  TestPlanDraft,
} from "@browser-tester/supervisor";
import { Agent } from "@browser-tester/agent";
import { Option } from "effect";
import figures from "figures";
import { VERSION } from "../constants.js";
import { CliRuntime } from "../runtime.js";
import type { TestRunConfig } from "./test-run-config.js";

const ACTION_LABELS: Record<TestRunConfig["action"], string> = {
  unstaged: "unstaged changes",
  branch: "branch",
  changes: "changes",
  commit: "commit",
};

const DEFAULT_INSTRUCTIONS: Record<TestRunConfig["action"], string> = {
  unstaged: "Test all unstaged changes in the browser and verify they work correctly.",
  branch: "Test all branch changes in the browser and verify they work correctly.",
  changes: "Test all changes from main in the browser and verify they work correctly.",
  commit: "Test the selected commit's changes in the browser and verify they work correctly.",
};

export const runTest = async (config: TestRunConfig): Promise<void> => {
  const { action } = config;
  const cwd = process.cwd();

  const agentBackend = config.planningProvider === "claude" ? "claude" : "codex";

  console.error(`testie v${VERSION}`);
  console.error(`Testing ${ACTION_LABELS[action]}\n`);

  try {
    const environment = {
      baseUrl: config.environmentOverrides?.baseUrl,
      headed: config.environmentOverrides?.headed,
      cookies: config.environmentOverrides?.cookies,
    };

    let testPlan;
    if (config.message) {
      console.error("Planning browser flow...");
      const draft = await Effect.runPromise(
        Effect.gen(function* () {
          const git = yield* Git;
          const currentBranch = yield* git.getCurrentBranch;
          const mainBranch = yield* git.getMainBranch;
          const changesFor =
            action === "branch"
              ? ChangesFor.Branch({ mainBranch })
              : action === "changes"
                ? ChangesFor.Changes({ mainBranch })
                : ChangesFor.WorkingTree();
          const fileStats = yield* git.getFileStats(changesFor);
          const diffPreview = yield* git.getDiffPreview(changesFor);

          return new TestPlanDraft({
            changesFor: { _tag: "WorkingTree" as const },
            currentBranch,
            diffPreview,
            fileStats: [...fileStats],
            instruction: config.message ?? "",
            baseUrl: environment.baseUrl ? Option.some(environment.baseUrl) : Option.none(),
            isHeadless: environment.headed === false,
            requiresCookies: environment.cookies === true,
          });
        }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
      );

      testPlan = await CliRuntime.runPromise(
        Planner.use((planner) => planner.plan(draft)).pipe(
          Effect.provide(Planner.layer),
          Effect.provide(Agent.layerFor(agentBackend)),
        ),
      );
      console.error(`Plan: ${testPlan.title} (${testPlan.steps.length} steps)\n`);
    } else {
      const instruction = DEFAULT_INSTRUCTIONS[action];
      testPlan = await Effect.runPromise(
        Effect.gen(function* () {
          const git = yield* Git;
          const currentBranch = yield* git.getCurrentBranch;
          const changesFor = ChangesFor.WorkingTree();
          const fileStats = yield* git.getFileStats(changesFor);
          const diffPreview = yield* git.getDiffPreview(changesFor);

          return new TestPlanDraft({
            changesFor: { _tag: "WorkingTree" as const },
            currentBranch,
            diffPreview,
            fileStats: [...fileStats],
            instruction,
            baseUrl: environment.baseUrl ? Option.some(environment.baseUrl) : Option.none(),
            isHeadless: environment.headed === false,
            requiresCookies: environment.cookies === true,
          });
        }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
      );
    }

    await CliRuntime.runPromise(
      Effect.gen(function* () {
        const executor = yield* Executor;
        // HACK: Effect v4 beta loses Stream element type through ServiceMap.Service inference
        const executionStream = (yield* executor.executePlan(
          testPlan,
        )) as Stream.Stream<ExecutedTestPlan>;

        const finalExecuted = yield* executionStream.pipe(
          Stream.tap((executed) =>
            Effect.sync(() => {
              const lastEvent = executed.events.at(-1);
              if (!lastEvent) return;
              switch (lastEvent._tag) {
                case "RunStarted":
                  console.error(`Starting ${lastEvent.plan.title}`);
                  break;
                case "StepStarted":
                  console.error(`${figures.arrowRight} ${lastEvent.stepId} ${lastEvent.title}`);
                  break;
                case "StepCompleted":
                  console.error(`  ${figures.tick} ${lastEvent.stepId} ${lastEvent.summary}`);
                  break;
                case "StepFailed":
                  console.error(`  ${figures.cross} ${lastEvent.stepId} ${lastEvent.message}`);
                  break;
              }
            }),
          ),
          Stream.runLast,
          Effect.map((option) =>
            option._tag === "Some"
              ? option.value
              : new ExecutedTestPlan({ ...testPlan, events: [] }),
          ),
        );

        const report = yield* Reporter.use((reporter) => reporter.report(finalExecuted)).pipe(
          Effect.provide(Reporter.layer),
        );
        console.error(`\nResult: ${report.status.toUpperCase()}`);
        console.error(report.summary);
      }).pipe(
        Effect.provide(Executor.layer),
        Effect.provide(Agent.layerFor(config.executionProvider === "claude" ? "claude" : "codex")),
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            if (!cause.reasons.every(Cause.isInterruptReason)) {
              console.error(`Error: ${Cause.pretty(cause)}`);
            }
          }),
        ),
      ),
    );
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
};

export const autoDetectAndTest = async (config?: Partial<TestRunConfig>): Promise<void> => {
  await runTest({ action: "changes", ...config });
};
