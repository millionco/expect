import { Effect, Option, Stream } from "effect";
import { changesForDisplayName, type ChangesFor, type ExecutionEvent } from "@expect/shared/models";
import { Executor, ExecutedTestPlan, Reporter } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import figures from "figures";
import prettyMs from "pretty-ms";
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

const HEADLESS_PROGRESS_HEARTBEAT_INTERVAL_MS = 15_000;
const VERBOSE_EVENT_TEXT_CHAR_LIMIT = 140;

const truncateEventText = (text: string) => {
  const compactText = text.trim().replace(/\s+/g, " ");
  if (compactText.length <= VERBOSE_EVENT_TEXT_CHAR_LIMIT) {
    return compactText;
  }
  return `${compactText.slice(0, VERBOSE_EVENT_TEXT_CHAR_LIMIT - 3)}...`;
};

const isProtocolMarkerMessage = (text: string) =>
  text.includes("STEP_START|") ||
  text.includes("STEP_DONE|") ||
  text.includes("ASSERTION_FAILED|") ||
  text.includes("STEP_SKIPPED|") ||
  text.includes("RUN_COMPLETED|");

const describeExecutionEvent = (event: ExecutionEvent, verbose: boolean) => {
  switch (event._tag) {
    case "RunStarted":
      return {
        activity: "run started",
        line: `Starting ${event.plan.title}`,
      } as const;
    case "StepStarted":
      return {
        activity: `step ${event.stepId} started`,
        line: `${figures.arrowRight} ${event.stepId} ${event.title}`,
      } as const;
    case "StepCompleted":
      return {
        activity: `step ${event.stepId} completed`,
        line: `  ${figures.tick} ${event.stepId} ${event.summary}`,
      } as const;
    case "StepFailed":
      return {
        activity: `step ${event.stepId} failed`,
        line: `  ${figures.cross} ${event.stepId} ${event.message}`,
      } as const;
    case "StepSkipped":
      return {
        activity: `step ${event.stepId} skipped`,
        line: `  ${figures.arrowRight} ${event.stepId} [skipped] ${event.reason}`,
      } as const;
    case "ToolCall":
      return {
        activity: `tool ${event.toolName} started`,
        line: `[tool] ${event.toolName} started`,
      } as const;
    case "ToolProgress":
      return {
        activity: `tool ${event.toolName} streaming (${event.outputSize} chars)`,
        line: undefined,
      } as const;
    case "ToolResult":
      return {
        activity: `tool ${event.toolName} ${event.isError ? "failed" : "completed"}`,
        line: `[tool] ${event.toolName} ${event.isError ? "failed" : "completed"}${
          verbose ? ` (${event.result.length} chars)` : ""
        }`,
      } as const;
    case "AgentThinking":
      return {
        activity: "agent thinking",
        line:
          verbose && event.text.trim().length > 0
            ? `[agent] thinking: ${truncateEventText(event.text)}`
            : undefined,
      } as const;
    case "AgentText":
      return {
        activity: "agent message",
        line:
          verbose && event.text.trim().length > 0 && !isProtocolMarkerMessage(event.text)
            ? `[agent] ${truncateEventText(event.text)}`
            : undefined,
      } as const;
    case "RunFinished":
      return {
        activity: `run finished ${event.status}`,
        line: `Run ${event.status}: ${event.summary}`,
      } as const;
  }
};

const isHeadlessRunTimeoutError = (error: unknown): error is HeadlessRunTimeoutError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "HeadlessRunTimeoutError" &&
  "message" in error;

export const runHeadless = (options: HeadlessRunOptions) => {
  const stdoutStartedAt = Date.now();
  let lastActivityAt = stdoutStartedAt;
  let lastActivitySummary = "starting browser test";
  const heartbeatTimer = setInterval(() => {
    console.log(
      `[heartbeat] ${prettyMs(Date.now() - stdoutStartedAt)} elapsed; last activity ${prettyMs(
        Date.now() - lastActivityAt,
      )} ago: ${lastActivitySummary}`,
    );
  }, HEADLESS_PROGRESS_HEARTBEAT_INTERVAL_MS);
  const stopHeartbeat = () => {
    clearInterval(heartbeatTimer);
  };
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
          const description = describeExecutionEvent(event, options.verbose);
          lastActivityAt = Date.now();
          lastActivitySummary = description.activity;
          if (description.line) {
            console.log(description.line);
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
      stopHeartbeat();
      process.exit(exitCode);
    })
    .catch((error) => {
      stopHeartbeat();
      if (isHeadlessRunTimeoutError(error)) {
        console.error(
          `\n${error.message} Last activity ${prettyMs(Date.now() - lastActivityAt)} ago: ${lastActivitySummary}.`,
        );
        process.exit(1);
      }
      throw error;
    });
};
