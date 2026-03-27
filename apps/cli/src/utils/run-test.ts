import { Cause, Config, Effect, Option, Predicate, Stream, Schema } from "effect";
import { changesForDisplayName, type ChangesFor, PlanId } from "@expect/shared/models";
import { Executor, ExecutedTestPlan, Git, Reporter } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import figures from "figures";
import { appendFileSync } from "node:fs";
import { VERSION, CI_HEARTBEAT_INTERVAL_MS } from "../constants";
import { layerCli } from "../layers";
import { playSound } from "./play-sound";
import { stripUndefinedRequirement } from "./strip-undefined-requirement";

class ExecutionTimeoutError extends Schema.ErrorClass<ExecutionTimeoutError>(
  "ExecutionTimeoutError",
)({
  _tag: Schema.tag("ExecutionTimeoutError"),
  timeoutMs: Schema.Number,
}) {
  message = `expect execution timed out after ${this.timeoutMs}ms`;
}

const formatElapsed = (startMs: number) => {
  const elapsed = (Date.now() - startMs) / 1000;
  return `[${elapsed.toFixed(1)}s]`;
};

const ghaEscape = (text: string) => text.replace(/\r?\n/g, " ").replace(/::/g, ": :");

export interface HeadlessExecutionOptions {
  changesFor: ChangesFor;
  instruction: string;
  headed: boolean;
  ci: boolean;
  timeoutMs: Option.Option<number>;
  requiresCookies: boolean;
  includeBanner?: boolean;
  playCompletionSound?: boolean;
}

export interface HeadlessExecutionResult {
  readonly status: "passed" | "failed";
  readonly reportText?: string;
  readonly failureMessage?: string;
}

export interface HeadlessRunOptions extends HeadlessExecutionOptions {
  agent: AgentBackend;
  verbose: boolean;
}

const makeFallbackExecutedPlan = (options: HeadlessExecutionOptions) =>
  new ExecutedTestPlan({
    id: PlanId.makeUnsafe("direct"),
    changesFor: options.changesFor,
    currentBranch: "",
    diffPreview: "",
    fileStats: [],
    instruction: options.instruction,
    baseUrl: Option.none(),
    isHeadless: !options.headed,
    requiresCookies: options.requiresCookies,
    testCoverage: Option.none(),
    title: options.instruction,
    rationale: "Direct execution",
    steps: [],
    events: [],
  });

const isKnownHeadlessFailure = (
  cause: Cause.Cause<unknown>,
): { tag: "ExecutionTimeoutError" | "ExecutionError"; message: string } | undefined => {
  const squashed = Cause.squash(cause);
  if (!Predicate.isObject(squashed) || !("_tag" in squashed) || !("message" in squashed)) {
    return undefined;
  }

  const tag = String(squashed._tag);
  const message = String(squashed.message);

  if (tag === "ExecutionTimeoutError" || tag === "ExecutionError") {
    return { tag, message };
  }

  return undefined;
};

export const executeHeadlessEffect = Effect.fn("executeHeadlessEffect")(function* (
  options: HeadlessExecutionOptions,
) {
  const executor = yield* Executor;
  const reporter = yield* Reporter;
  const analytics = yield* Analytics;
  const git = yield* Git;

  const sessionStartedAt = Date.now();
  yield* analytics.capture("session:started", {
    mode: "headless",
    skip_planning: false,
    browser_headed: options.headed,
  });

  const isGitHubActions =
    (yield* Config.string("GITHUB_ACTIONS").pipe(Config.withDefault(""))) !== "";

  if (options.includeBanner ?? true) {
    const modeLabel = options.ci ? " [CI mode]" : "";
    console.log(`expect v${VERSION}${modeLabel}`);
    if (Option.isSome(options.timeoutMs)) {
      console.log(`Timeout: ${options.timeoutMs.value}ms`);
    }
    console.log(`Target: ${changesForDisplayName(options.changesFor)}`);
    console.log("Starting browser test...");
  }

  if (isGitHubActions) {
    console.log("::group::expect test execution");
  }

  const runStartedAt = Date.now();
  let lastOutputAt = Date.now();

  const heartbeatInterval = options.ci
    ? setInterval(() => {
        const now = Date.now();
        if (now - lastOutputAt >= CI_HEARTBEAT_INTERVAL_MS) {
          const elapsedMinutes = Math.floor((now - runStartedAt) / 60_000);
          console.log(
            `${formatElapsed(runStartedAt)} Still running... (${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} elapsed)`,
          );
          lastOutputAt = now;
        }
      }, CI_HEARTBEAT_INTERVAL_MS)
    : undefined;

  yield* analytics.capture("run:started", { plan_id: "direct" });
  const seenEvents = new Set<string>();
  const printNewEvents = (executed: ExecutedTestPlan) => {
    for (const event of executed.events) {
      if (seenEvents.has(event.id)) continue;
      seenEvents.add(event.id);
      lastOutputAt = Date.now();
      const elapsed = formatElapsed(runStartedAt);
      switch (event._tag) {
        case "RunStarted":
          console.log(`${elapsed} Starting ${event.plan.title}`);
          break;
        case "StepStarted":
          console.log(`${elapsed} ${figures.arrowRight} ${event.stepId} ${event.title}`);
          break;
        case "StepCompleted":
          console.log(`${elapsed}   ${figures.tick} ${event.stepId} ${event.summary}`);
          break;
        case "StepFailed": {
          console.log(`${elapsed}   ${figures.cross} ${event.stepId} ${event.message}`);
          if (isGitHubActions) {
            console.log(
              `::error title=${ghaEscape(event.stepId)} failed::${ghaEscape(event.message)}`,
            );
          }
          break;
        }
        case "StepSkipped":
          console.log(
            `${elapsed}   ${figures.arrowRight} ${event.stepId} [skipped] ${event.reason}`,
          );
          break;
      }
    }
  };

  const executeStream = executor
    .execute({
      changesFor: options.changesFor,
      instruction: options.instruction,
      isHeadless: !options.headed,
      requiresCookies: options.requiresCookies,
    })
    .pipe(
      Stream.tap((executed) => Effect.sync(() => printNewEvents(executed))),
      Stream.runLast,
      Effect.map((option) =>
        (option._tag === "Some"
          ? option.value
          : makeFallbackExecutedPlan(options)
        ).finalizeTextBlock(),
      ),
    );

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

  const executeExit = yield* executeWithTimeout.pipe(Effect.exit);

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  if (isGitHubActions) {
    console.log("::endgroup::");
  }

  if (executeExit._tag === "Failure") {
    const failure = isKnownHeadlessFailure(executeExit.cause);
    if (!failure) {
      return yield* Effect.failCause(executeExit.cause);
    }

    if (failure.tag === "ExecutionTimeoutError" && isGitHubActions) {
      console.log(`::error title=Execution timed out::${ghaEscape(failure.message)}`);
    }
    console.error(`\n${failure.message}`);

    yield* analytics.capture("run:failed", {
      plan_id: "direct",
      error_tag: failure.tag,
    });
    yield* analytics.capture("session:ended", {
      session_ms: Date.now() - sessionStartedAt,
    });
    yield* analytics.flush;

    return {
      status: "failed",
      failureMessage: failure.message,
    } satisfies HeadlessExecutionResult;
  }

  const finalExecuted = executeExit.value;
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

  const reportText = report.toPlainText;
  console.error(`\n${reportText}`);

  const stepSummaryPath = yield* Config.option(Config.string("GITHUB_STEP_SUMMARY"));
  if (Option.isSome(stepSummaryPath)) {
    const badge = report.status === "passed" ? "**Result: PASSED**" : "**Result: FAILED**";
    const summary = `## expect test results\n\n${badge}\n\n\`\`\`\n${reportText}\n\`\`\`\n`;
    yield* Effect.sync(() => appendFileSync(stepSummaryPath.value, summary));
  }

  if (report.status === "passed") {
    yield* git.saveTestedFingerprint();
  }

  if (options.playCompletionSound ?? true) {
    yield* Effect.promise(() => playSound());
  }

  return {
    status: report.status,
    reportText,
  } satisfies HeadlessExecutionResult;
});

export const runHeadless = async (options: HeadlessRunOptions) => {
  const result = await Effect.runPromise(
    stripUndefinedRequirement(
      executeHeadlessEffect(options).pipe(
        Effect.provide(layerCli({ verbose: options.verbose, agent: options.agent })),
      ),
    ),
  );

  process.exit(result.status === "passed" ? 0 : 1);
};
