import { Effect, Stream } from "effect";
import { changesForDisplayName, type ChangesFor } from "@expect/shared/models";
import { Executor, ExecutedTestPlan, Reporter } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import figures from "figures";
import { VERSION } from "../constants";
import { layerCli } from "../layers";
import { playSound } from "./play-sound";
import { stripUndefinedRequirement } from "./strip-undefined-requirement";

interface HeadlessRunOptions {
  changesFor: ChangesFor;
  instruction: string;
  agent: AgentBackend;
  verbose: boolean;
  headed: boolean;
}

export const runHeadless = (options: HeadlessRunOptions) =>
  Effect.runPromise(
    stripUndefinedRequirement(
      Effect.gen(function* () {
        const executor = yield* Executor;
        const reporter = yield* Reporter;
        const analytics = yield* Analytics;

        const sessionStartedAt = Date.now();
        yield* analytics.capture("session:started", {
          mode: "headless",
          skip_planning: false,
          browser_headed: options.headed,
        });

        console.log(`expect v${VERSION}`);
        console.log(`Testing ${changesForDisplayName(options.changesFor)}`);
        console.log("Starting browser test...");

        const runStartedAt = Date.now();
        const seenEvents = new Set<string>();
        const finalExecuted = yield* executor
          .execute({
            changesFor: options.changesFor,
            instruction: options.instruction,
            isHeadless: !options.headed,
            requiresCookies: false,
          })
          .pipe(
            Stream.tap((executed) =>
              Effect.sync(() => {
                for (const event of executed.events) {
                  if (seenEvents.has(event.id)) continue;
                  seenEvents.add(event.id);
                  switch (event._tag) {
                    case "RunStarted":
                      console.log(`Starting ${event.plan.title}`);
                      break;
                    case "StepStarted":
                      console.log(`${figures.arrowRight} ${event.stepId} ${event.title}`);
                      break;
                    case "StepCompleted":
                      console.log(`  ${figures.tick} ${event.stepId} ${event.summary}`);
                      break;
                    case "StepFailed":
                      console.log(`  ${figures.cross} ${event.stepId} ${event.message}`);
                      break;
                  }
                }
              }),
            ),
            Stream.runLast,
            Effect.map((option) =>
              option._tag === "Some"
                ? option.value
                : new ExecutedTestPlan({
                    id: "" as never,
                    changesFor: options.changesFor,
                    currentBranch: "",
                    diffPreview: "",
                    fileStats: [],
                    instruction: options.instruction,
                    baseUrl: undefined as never,
                    isHeadless: !options.headed,
                    requiresCookies: false,
                    title: options.instruction,
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

        yield* analytics.capture("session:ended", {
          session_ms: Date.now() - sessionStartedAt,
        });
        yield* analytics.flush;

        console.error(`\n${report.toPlainText}`);
        yield* Effect.promise(() => playSound());
        process.exit(report.status === "passed" ? 0 : 1);
      }).pipe(Effect.provide(layerCli({ verbose: options.verbose, agent: options.agent }))),
    ),
  );
