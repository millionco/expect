import { Effect, Option, Stream, Schema } from "effect";
import type { ChangesFor } from "@expect/shared/models";
import { Executor, OutputReporter, Reporter } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import { layerCli } from "../layers";
import { playSound } from "./play-sound";

class ExecutionTimeoutError extends Schema.ErrorClass<ExecutionTimeoutError>(
  "ExecutionTimeoutError",
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
  timeoutMs: Option.Option<number>;
  reporter?: "json" | "github-actions";
}

export const runHeadless = (options: HeadlessRunOptions) =>
  Effect.gen(function* () {
    const executor = yield* Executor;
    const reporter = yield* Reporter;
    const outputReporter = yield* OutputReporter;
    const analytics = yield* Analytics;

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
        cookieImportProfiles: [],
      })
      .pipe(Stream.runLast);

    const timeoutMs = Option.getOrUndefined(options.timeoutMs);
    const executeWithTimeout =
      timeoutMs !== undefined
        ? executeStream.pipe(
            Effect.timeoutOrElse({
              duration: `${timeoutMs} millis`,
              onTimeout: () => Effect.fail(new ExecutionTimeoutError({ timeoutMs })),
            }),
          )
        : executeStream;

    const finalExecuted = yield* executeWithTimeout.pipe(
      Effect.flatMap((executedTestPlanOption) => executedTestPlanOption.asEffect()),
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
    Effect.provide(
      layerCli({
        verbose: options.verbose,
        agent: options.agent,
        reporter: options.reporter,
        timeoutMs: Option.getOrUndefined(options.timeoutMs),
      }),
    ),
    Effect.scoped,
    Effect.runPromise,
  );
