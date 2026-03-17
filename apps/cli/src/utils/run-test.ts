import * as crypto from "node:crypto";
import { Cause, Effect, Option, Stream } from "effect";
import { changesForDisplayName, type ChangesFor } from "@browser-tester/shared/models";
import {
  DraftId,
  Executor,
  ExecutedTestPlan,
  Git,
  Planner,
  Reporter,
  TestPlanDraft,
} from "@browser-tester/supervisor";
import { Agent } from "@browser-tester/agent";
import figures from "figures";
import { VERSION } from "../constants.js";
import { CliRuntime } from "../runtime.js";

interface HeadlessRunOptions {
  changesFor: ChangesFor;
  instruction: string;
}

export const runHeadless = async (options: HeadlessRunOptions): Promise<void> => {
  const cwd = process.cwd();

  console.error(`testie v${VERSION}`);
  console.error(`Testing ${changesForDisplayName(options.changesFor)}\n`);

  try {
    console.error("Planning browser flow...");

    const draft = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* Git;
        const currentBranch = yield* git.getCurrentBranch;
        const fileStats = yield* git.getFileStats(options.changesFor);
        const diffPreview = yield* git.getDiffPreview(options.changesFor);

        return new TestPlanDraft({
          id: DraftId.makeUnsafe(crypto.randomUUID()),
          changesFor: options.changesFor,
          currentBranch,
          diffPreview,
          fileStats: [...fileStats],
          instruction: options.instruction,
          baseUrl: Option.none(),
          isHeadless: false,
          requiresCookies: false,
        });
      }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
    );

    const testPlan = await CliRuntime.runPromise(
      Planner.use((planner) => planner.plan(draft)).pipe(
        Effect.provide(Planner.layer),
        Effect.provide(Agent.layerFor("claude")),
      ),
    );
    console.error(`Plan: ${testPlan.title} (${testPlan.steps.length} steps)\n`);

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
        Effect.provide(Agent.layerFor("claude")),
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
