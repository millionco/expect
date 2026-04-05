import { Effect, Option, Stream, Schema, Cause } from "effect";
import type { ChangesFor } from "@expect/shared/models";
import { Browsers } from "@expect/cookies";
import { Executor, OutputReporter, Reporter } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import { layerCli } from "../layers";
import { playSound } from "./play-sound";

class ExecutionTimeoutError extends Schema.ErrorClass<ExecutionTimeoutError>(
  "ExecutionTimeoutError"
)({
  _tag: Schema.tag("ExecutionTimeoutError"),
  timeoutMs: Schema.Number,
}) {
  message = `expect execution timed out after ${this.timeoutMs}ms`;
}

interface HeadlessRunOptions {
  changesFor: ChangesFor;
  instruction: string;
  agent: AgentBackend;
  verbose: boolean;
  headed: boolean;
  ci: boolean;
  noCookies: boolean;
  browserProfileIds: readonly string[];
  timeoutMs: Option.Option<number>;
  reporter?: "json" | "github-actions";
  replayHost?: string;
  testId?: string;
}

export const runHeadless = (options: HeadlessRunOptions) =>
  Effect.gen(function* () {
    const executor = yield* Executor;
    const reporter = yield* Reporter;
    const outputReporter = yield* OutputReporter;
    const analytics = yield* Analytics;
    const browsers = yield* Browsers;

    const cookieImportProfiles =
      options.noCookies || options.browserProfileIds.length === 0
        ? []
        : yield* Effect.forEach(options.browserProfileIds, (id) =>
            browsers.findById(id)
          );

    const sessionStartedAt = Date.now();
    yield* analytics.capture("session:started", {
      mode: "headless",
      skip_planning: false,
      browser_headed: options.headed,
    });

    yield* analytics.capture("run:started", { plan_id: "direct" });

    const executeStream = executor
      .execute({
        changesFor: options.changesFor,
        instruction: options.instruction,
        isHeadless: !options.headed,
        cookieImportProfiles,
      })
      .pipe(Stream.runLast);

    const timeoutMs = Option.getOrUndefined(options.timeoutMs);
    const executeWithTimeout =
      timeoutMs !== undefined
        ? executeStream.pipe(
            Effect.timeoutOrElse({
              duration: `${timeoutMs} millis`,
              onTimeout: () =>
                Effect.fail(new ExecutionTimeoutError({ timeoutMs })),
            })
          )
        : executeStream;

    const finalExecuted = yield* executeWithTimeout.pipe(
      Effect.flatMap((executedTestPlanOption) =>
        executedTestPlanOption.asEffect()
      )
    );

    const report = yield* reporter.report(finalExecuted);

    yield* analytics.capture("run:completed", {
      plan_id: finalExecuted.id ?? "direct",
      passed: report.passedStepCount,
      failed: report.failedStepCount,
      step_count: finalExecuted.steps.length,
      file_count: 0,
      duration_ms: Date.now() - sessionStartedAt,
    });

    yield* analytics.capture("session:ended", {
      session_ms: Date.now() - sessionStartedAt,
    });
    yield* analytics.flush;

    yield* outputReporter.onComplete(report);
    yield* Effect.promise(() => playSound());
    yield* report.assertSuccess();
  }).pipe(
    Effect.withSpan("expect.session"),
    Effect.provide(
      layerCli({
        verbose: options.verbose,
        agent: options.agent,
        reporter: options.reporter,
        timeoutMs: Option.getOrUndefined(options.timeoutMs),
        replayHost: options.replayHost,
        testId: options.testId,
      })
    ),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.die(cause)
    ),
    Effect.tapCause((cause) => Effect.logFatal(cause)),
    Effect.runPromise
  );
