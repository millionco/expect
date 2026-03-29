import { Config, Effect, Option, Stream, Schema } from "effect";
import { type ChangesFor, CiResultOutput, CiStepResult } from "@expect/shared/models";
import { Executor, ExecutedTestPlan, Reporter, Github } from "@expect/supervisor";
import { Analytics } from "@expect/shared/observability";
import type { AgentBackend } from "@expect/agent";
import { VERSION, CI_HEARTBEAT_INTERVAL_MS } from "../constants";
import { layerCli } from "../layers";
import { playSound } from "./play-sound";
import { stripUndefinedRequirement } from "./strip-undefined-requirement";
import { extractCloseArtifacts } from "./extract-close-artifacts";
import { RrVideo } from "@expect/browser";
import { createCiReporter } from "./ci-reporter";
import { writeGhaOutputs, writeGhaStepSummary } from "./gha-output";
import { getStepElapsedMs, getTotalElapsedMs } from "./step-elapsed";
import { formatElapsedTime } from "./format-elapsed-time";

class ExecutionTimeoutError extends Schema.ErrorClass<ExecutionTimeoutError>(
  "ExecutionTimeoutError",
)({
  _tag: Schema.tag("ExecutionTimeoutError"),
  timeoutMs: Schema.Number,
}) {
  message = `expect execution timed out after ${this.timeoutMs}ms`;
}

const COMMENT_MARKER = "<!-- expect-ci-result -->";

interface HeadlessRunOptions {
  changesFor: ChangesFor;
  instruction: string;
  agent: AgentBackend;
  verbose: boolean;
  headed: boolean;
  ci: boolean;
  timeoutMs: Option.Option<number>;
  output: "text" | "json";
}

export const runHeadless = (options: HeadlessRunOptions) =>
  Effect.runPromise(
    stripUndefinedRequirement(
      Effect.scoped(
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

          const isGitHubActions =
            (yield* Config.string("GITHUB_ACTIONS").pipe(Config.withDefault(""))) !== "";
          const isJsonOutput = options.output === "json";

          const timeoutMs = Option.getOrUndefined(options.timeoutMs);
          const ciReporter = createCiReporter({
            version: VERSION,
            agent: options.agent,
            timeoutMs,
            isGitHubActions,
          });

          if (!isJsonOutput) {
            ciReporter.header();
            ciReporter.groupOpen();
          }

          const runStartedAt = Date.now();
          let lastOutputAt = Date.now();

          if (options.ci && !isJsonOutput) {
            yield* Effect.acquireRelease(
              Effect.sync(() =>
                setInterval(() => {
                  const now = Date.now();
                  if (now - lastOutputAt >= CI_HEARTBEAT_INTERVAL_MS) {
                    ciReporter.heartbeat(now - runStartedAt);
                    lastOutputAt = now;
                  }
                }, CI_HEARTBEAT_INTERVAL_MS),
              ),
              (interval) => Effect.sync(() => clearInterval(interval)),
            );
          }

          yield* analytics.capture("run:started", { plan_id: "direct" });
          const seenEvents = new Set<string>();
          const printNewEvents = (executed: ExecutedTestPlan) => {
            if (isJsonOutput) return;
            for (const event of executed.events) {
              if (seenEvents.has(event.id)) continue;
              seenEvents.add(event.id);
              lastOutputAt = Date.now();
              switch (event._tag) {
                case "RunStarted":
                  ciReporter.planTitle(event.plan.title, Option.getOrUndefined(event.plan.baseUrl));
                  break;
                case "StepStarted":
                  ciReporter.stepStarted(event.title);
                  break;
                case "StepCompleted": {
                  const step = executed.steps.find((step) => step.id === event.stepId);
                  const elapsed = step ? getStepElapsedMs(step) : undefined;
                  ciReporter.stepCompleted(event.summary, elapsed);
                  break;
                }
                case "StepFailed": {
                  const failedStep = executed.steps.find((step) => step.id === event.stepId);
                  const failedTitle = failedStep?.title ?? event.stepId;
                  const failedElapsed = failedStep ? getStepElapsedMs(failedStep) : undefined;
                  ciReporter.stepFailed(failedTitle, event.message, failedElapsed);
                  break;
                }
                case "StepSkipped": {
                  const skippedStep = executed.steps.find((step) => step.id === event.stepId);
                  const skippedTitle = skippedStep?.title ?? event.stepId;
                  ciReporter.stepSkipped(skippedTitle, event.reason);
                  break;
                }
              }
            }
          };

          const executeStream = executor
            .execute({
              changesFor: options.changesFor,
              instruction: options.instruction,
              isHeadless: !options.headed,
              cookieBrowserKeys: [],
            })
            .pipe(
              Stream.tap((executed) => Effect.sync(() => printNewEvents(executed))),
              Stream.runLast,
              Effect.map((option) =>
                Option.getOrElse(
                  option,
                  () =>
                    new ExecutedTestPlan({
                      id: "" as never,
                      changesFor: options.changesFor,
                      currentBranch: "",
                      diffPreview: "",
                      fileStats: [],
                      instruction: options.instruction,
                      baseUrl: undefined as never,
                      isHeadless: !options.headed,
                      cookieBrowserKeys: [],
                      testCoverage: Option.none(),
                      title: options.instruction,
                      rationale: "Direct execution",
                      steps: [],
                      events: [],
                    }),
                )
                  .finalizeTextBlock()
                  .synthesizeRunFinished(),
              ),
            );

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
            Effect.tapError(() =>
              Effect.sync(() => {
                if (!isJsonOutput) ciReporter.groupClose();
              }),
            ),
            Effect.catchTag("ExecutionTimeoutError", (error) => {
              if (isJsonOutput) {
                const resultOutput = new CiResultOutput({
                  version: VERSION,
                  status: "failed" as const,
                  title: options.instruction,
                  duration_ms: error.timeoutMs,
                  steps: [],
                  artifacts: {},
                  summary: `Timed out after ${formatElapsedTime(error.timeoutMs)}`,
                });
                const jsonString = JSON.stringify(
                  Schema.encodeSync(CiResultOutput)(resultOutput),
                  undefined,
                  2,
                );
                process.stdout.write(jsonString + "\n");
              } else {
                ciReporter.timeoutError(error.timeoutMs);
              }
              return Effect.sync(() => process.exit(1));
            }),
          );

          printNewEvents(finalExecuted);

          if (!isJsonOutput) {
            ciReporter.groupClose();
          }

          const report = yield* reporter.report(finalExecuted);

          const statuses = report.stepStatuses;
          const passedCount = report.steps.filter(
            (step) => statuses.get(step.id)?.status === "passed",
          ).length;
          const failedCount = report.steps.filter(
            (step) => statuses.get(step.id)?.status === "failed",
          ).length;
          const skippedCount = report.steps.filter(
            (step) => statuses.get(step.id)?.status === "skipped",
          ).length;
          const totalDurationMs = getTotalElapsedMs(report.steps);

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

          const artifacts = extractCloseArtifacts(finalExecuted.events);

          let generatedVideoPath: string | undefined;
          if (artifacts.replaySessionPath && artifacts.replaySessionPath.endsWith(".ndjson")) {
            const latestJsonPath = artifacts.replaySessionPath.replace(/\.ndjson$/, "-latest.json");
            const videoOutputPath = artifacts.replaySessionPath.replace(/\.ndjson$/, ".mp4");
            const rrvideo = yield* RrVideo;
            generatedVideoPath = yield* rrvideo
              .convert({
                inputPath: latestJsonPath,
                outputPath: videoOutputPath,
                skipInactive: true,
                speed: 1,
              })
              .pipe(
                Effect.catchTag("RrVideoConvertError", (error) =>
                  Effect.sync(() => {
                    if (!isJsonOutput) {
                      process.stderr.write(`Warning: video generation failed: ${error.message}\n`);
                    }
                    return undefined;
                  }),
                ),
              );
          }

          const effectiveVideoPath = generatedVideoPath ?? artifacts.videoPath;

          if (!isJsonOutput) {
            ciReporter.summary(
              passedCount,
              failedCount,
              skippedCount,
              report.steps.length,
              totalDurationMs,
            );
            ciReporter.artifacts(effectiveVideoPath, artifacts.localReplayUrl);
          }

          if (isGitHubActions) {
            yield* writeGhaOutputs(report.status, effectiveVideoPath, artifacts.replayPath);
            yield* writeGhaStepSummary(
              report.toPlainText,
              report.status,
              effectiveVideoPath,
              artifacts.replayPath,
            );

            yield* Effect.gen(function* () {
              const github = yield* Github;
              const cwd = process.cwd();
              const currentBranch = finalExecuted.currentBranch;
              if (!currentBranch) return;

              const pullRequest = yield* github.findPullRequest(cwd, {
                _tag: "Branch",
                branchName: currentBranch,
              });
              if (Option.isNone(pullRequest)) return;

              const statusEmoji = report.status === "passed" ? "\u2705" : "\u274c";
              const statusLabel = report.status === "passed" ? "Passed" : "Failed";
              const escapeTableCell = (text: string) =>
                text.replace(/\|/g, "\\|").replace(/\n/g, " ");
              const stepRows = report.steps
                .map((step) => {
                  const entry = statuses.get(step.id);
                  const stepStatus = entry?.status ?? "not-run";
                  const stepIcon =
                    stepStatus === "passed"
                      ? "\u2713"
                      : stepStatus === "failed"
                        ? "\u2717"
                        : stepStatus === "skipped"
                          ? "\u2192"
                          : "\u2013";
                  const stepSummary = entry?.summary ?? "";
                  const stepTime = getStepElapsedMs(step);
                  const timeLabel = stepTime !== undefined ? formatElapsedTime(stepTime) : "-";
                  const statusCell =
                    stepStatus === "failed"
                      ? `${stepIcon} ${escapeTableCell(stepSummary)}`
                      : stepIcon;
                  return `| ${escapeTableCell(step.title)} | ${statusCell} | ${timeLabel} |`;
                })
                .join("\n");

              const videoSection = effectiveVideoPath
                ? `\n**Video:** see workflow artifacts\n`
                : "";

              const maxBacktickRun = (report.toPlainText.match(/`+/g) ?? []).reduce(
                (max, run) => Math.max(max, run.length),
                2,
              );
              const fence = "`".repeat(maxBacktickRun + 1);

              const commentBody = [
                COMMENT_MARKER,
                `## expect test results`,
                "",
                `**${statusEmoji} ${statusLabel}** \u2014 ${report.steps.length} step${report.steps.length === 1 ? "" : "s"} in ${formatElapsedTime(totalDurationMs)}`,
                "",
                "| Step | Status | Time |",
                "|------|--------|------|",
                stepRows,
                videoSection,
                "<details><summary>Full output</summary>",
                "",
                fence,
                report.toPlainText,
                fence,
                "",
                "</details>",
              ].join("\n");

              yield* github.upsertComment(cwd, pullRequest.value, COMMENT_MARKER, commentBody);
            }).pipe(
              Effect.provide(Github.layer),
              Effect.catchTag("GitHubCommandError", (error) =>
                Effect.logWarning("PR comment failed", { error: error.message }),
              ),
            );
          }

          if (isJsonOutput) {
            const stepResults = report.steps.map((step) => {
              const entry = statuses.get(step.id);
              const stepStatus = entry?.status ?? ("not-run" as const);
              const elapsed = getStepElapsedMs(step);
              return new CiStepResult({
                title: step.title,
                status: stepStatus,
                ...(elapsed !== undefined ? { duration_ms: elapsed } : {}),
                ...(stepStatus === "failed" && entry?.summary ? { error: entry.summary } : {}),
              });
            });

            const summaryParts = [`${passedCount} passed`, `${failedCount} failed`];
            if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
            const summaryText = `${summaryParts.join(", ")} out of ${report.steps.length} step${report.steps.length === 1 ? "" : "s"}`;

            const resultOutput = new CiResultOutput({
              version: VERSION,
              status: report.status,
              title: report.title,
              duration_ms: totalDurationMs,
              steps: stepResults,
              artifacts: {
                ...(effectiveVideoPath ? { video: effectiveVideoPath } : {}),
                ...(artifacts.replayPath ? { replay: artifacts.replayPath } : {}),
              },
              summary: summaryText,
            });

            const jsonString = JSON.stringify(
              Schema.encodeSync(CiResultOutput)(resultOutput),
              undefined,
              2,
            );
            process.stdout.write(jsonString + "\n");
          }

          yield* Effect.promise(() => playSound());
          return report.status;
        }).pipe(Effect.provide(layerCli({ verbose: options.verbose, agent: options.agent }))),
      ),
    ),
  ).then((status) => {
    process.exit(status === "passed" ? 0 : 1);
  });
