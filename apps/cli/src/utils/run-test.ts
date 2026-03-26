import { Effect, Option, Stream } from "effect";
import { changesForDisplayName, type ChangesFor } from "@expect/shared/models";
import { Executor, ExecutedTestPlan, Reporter } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import figures from "figures";
import { VERSION } from "../constants";
import { layerCli } from "../layers";
import { HeadlessRunTimeoutError, withHeadlessRunTimeout } from "./headless-run-timeout";
import { playSound } from "./play-sound";
import { stripUndefinedRequirement } from "./strip-undefined-requirement";

interface HeadlessRunOptions {
  changesFor: ChangesFor;
  instruction: string;
  agent: AgentBackend;
  verbose: boolean;
  headed: boolean;
}

const isHeadlessRunTimeoutError = (error: unknown): error is HeadlessRunTimeoutError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "HeadlessRunTimeoutError" &&
  "message" in error;

export const runHeadless = (options: HeadlessRunOptions) => {
  const runHeadlessEffect = stripUndefinedRequirement(
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
      yield* analytics.capture("run:started", { plan_id: "direct" });
      const seenEvents = new Set<string>();
      const printNewEvents = (executed: ExecutedTestPlan) => {
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
            case "StepSkipped":
              console.log(`  ${figures.arrowRight} ${event.stepId} [skipped] ${event.reason}`);
              break;
          }
        }
      };
      const finalExecuted = yield* withHeadlessRunTimeout(
        executor
          .execute({
            changesFor: options.changesFor,
            instruction: options.instruction,
            isHeadless: !options.headed,
            requiresCookies: false,
          })
          .pipe(
            Stream.tap((executed) => Effect.sync(() => printNewEvents(executed))),
            Stream.runLast,
            Effect.map((option) =>
              (option._tag === "Some"
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
                    testCoverage: Option.none(),
                    title: options.instruction,
                    rationale: "Direct execution",
                    steps: [],
                    events: [],
                  })
              ).finalizeTextBlock(),
            ),
          ),
      ).pipe(
        Effect.catchTag("HeadlessRunTimeoutError", (error) =>
          Effect.gen(function* () {
            yield* analytics
              .capture("run:failed", {
                plan_id: "direct",
                error_tag: error._tag,
              })
              .pipe(Effect.catchCause(() => Effect.void));
            yield* analytics
              .capture("session:ended", {
                session_ms: Date.now() - sessionStartedAt,
              })
              .pipe(Effect.catchCause(() => Effect.void));
            yield* analytics.flush.pipe(Effect.catchCause(() => Effect.void));
            return yield* error;
          }),
        ),
      );
      printNewEvents(finalExecuted);

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
      return report.status === "passed" ? 0 : 1;
    }).pipe(Effect.provide(layerCli({ verbose: options.verbose, agent: options.agent }))),
  );

  return Effect.runPromise(runHeadlessEffect)
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      if (isHeadlessRunTimeoutError(error)) {
        console.error(`\n${error.message}`);
        process.exit(1);
      }
      throw error;
    });
};
