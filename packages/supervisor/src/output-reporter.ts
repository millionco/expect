import pc from "picocolors";
import figures from "figures";
import {
  Config,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Queue,
  Schema,
  ServiceMap,
  Stdio,
  Stream,
} from "effect";
import { NodeServices } from "@effect/platform-node";
import {
  CurrentPlanId,
  TestReport,
  type ExecutedTestPlan,
  type ExecutionEvent,
} from "@expect/shared/models";
import { RrVideo } from "@expect/browser";
import { Github } from "./github";
import { GitRepoRoot } from "./git/git";
import { EXPECT_STATE_DIR, REPLAYS_DIRECTORY_NAME } from "./constants";

const ghaEscape = (text: string) =>
  text.replace(/\r?\n/g, " ").replace(/::/g, ": :");

const formatElapsed = (ms: number) => Duration.format(Duration.millis(ms));

const COMMENT_MARKER = "<!-- expect-ci-result -->";

const makeQueueWriter = (stdio: Stdio.Stdio, channel: "stdout" | "stderr") =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<string>();
    yield* Stream.fromQueue(queue).pipe(
      Stream.map((text) => text + "\n"),
      Stream.run(channel === "stdout" ? stdio.stdout() : stdio.stderr()),
      Effect.orDie,
      Effect.forkScoped
    );
    return (text: string) => Queue.offer(queue, text).pipe(Effect.orDie);
  });

type Writer = (text: string) => Effect.Effect<void>;

export class OutputReporterHooks extends ServiceMap.Service<
  OutputReporterHooks,
  {
    readonly onStepFailed: (
      stepId: string,
      message: string
    ) => Effect.Effect<void>;
    readonly onGroupOpen: () => Effect.Effect<void>;
    readonly onGroupClose: () => Effect.Effect<void>;
    readonly onReportComplete: (report: TestReport) => Effect.Effect<void>;
    readonly onTimeout: (message: string) => Effect.Effect<void>;
  }
>()("@supervisor/OutputReporterHooks") {
  static layerNoop = Layer.succeed(this, {
    onStepFailed: () => Effect.void,
    onGroupOpen: () => Effect.void,
    onGroupClose: () => Effect.void,
    onReportComplete: () => Effect.void,
    onTimeout: () => Effect.void,
  });

  static layerGitHubActions = Layer.effect(this)(
    Effect.gen(function* () {
      const stdio = yield* Stdio.Stdio;
      const fileSystem = yield* FileSystem.FileSystem;
      const github = yield* Github;
      const rrvideo = yield* RrVideo;
      const planId = yield* CurrentPlanId;
      const repoRoot = yield* GitRepoRoot;
      const writeStdout = yield* makeQueueWriter(stdio, "stdout");

      const replayPath = `${repoRoot}/${EXPECT_STATE_DIR}/${REPLAYS_DIRECTORY_NAME}/${planId}.ndjson`;
      const githubOutputPath = yield* Config.string("GITHUB_OUTPUT").pipe(
        Config.option
      );
      const summaryPath = yield* Config.string("GITHUB_STEP_SUMMARY").pipe(
        Config.option
      );

      return {
        onStepFailed: (stepId: string, message: string) =>
          writeStdout(
            `::error title=${ghaEscape(stepId)} failed::${ghaEscape(message)}`
          ),
        onGroupOpen: () => writeStdout("::group::expect test execution"),
        onGroupClose: () => writeStdout("::endgroup::"),
        onReportComplete: (report: TestReport) =>
          Effect.gen(function* () {
            if (Option.isSome(githubOutputPath)) {
              yield* fileSystem.writeFileString(
                githubOutputPath.value,
                `result=${report.status}\n`,
                { flag: "a" }
              );
            }

            if (Option.isSome(summaryPath)) {
              yield* fileSystem.writeFileString(
                summaryPath.value,
                report.toGithubStepSummary,
                { flag: "a" }
              );
            }

            const videoPath = yield* rrvideo.convert({
              inputPath: replayPath.replace(/\.ndjson$/, "-latest.json"),
              outputPath: replayPath.replace(/\.ndjson$/, ".mp4"),
              skipInactive: true,
              speed: 1,
            });
            if (Option.isSome(githubOutputPath) && videoPath) {
              yield* fileSystem.writeFileString(
                githubOutputPath.value,
                `video_path=${videoPath}\n`,
                { flag: "a" }
              );
            }

            const cwd = process.cwd();
            const currentBranch = report.currentBranch;
            if (currentBranch) {
              const pullRequest = yield* github.findPullRequest(cwd, {
                _tag: "Branch",
                branchName: currentBranch,
              });
              if (Option.isSome(pullRequest)) {
                yield* github.upsertComment(
                  cwd,
                  pullRequest.value,
                  COMMENT_MARKER,
                  report.toGithubComment
                );
              }
            }
          }).pipe(
            Effect.catchTags({
              GitHubCommandError: Effect.die,
              PlatformError: Effect.die,
              RrVideoConvertError: Effect.die,
            })
          ),
        onTimeout: (message: string) =>
          writeStdout(
            `::error title=Execution timed out::${ghaEscape(message)}`
          ),
      };
    })
  ).pipe(
    Layer.provide(Github.layer),
    Layer.provide(RrVideo.layer),
    Layer.provide(NodeServices.layer)
  );
}

export class OutputReporter extends ServiceMap.Service<
  OutputReporter,
  {
    readonly onExecutedPlan: (
      executed: ExecutedTestPlan
    ) => Effect.Effect<void>;
    readonly onComplete: (report: TestReport) => Effect.Effect<void>;
    readonly onTimeout: (timeoutMs: number) => Effect.Effect<void>;
  }
>()("@supervisor/OutputReporter") {
  static layerNoop = Layer.succeed(this, {
    onExecutedPlan: () => Effect.void,
    onComplete: () => Effect.void,
    onTimeout: () => Effect.void,
  });

  static layerStdout = (options: {
    agent: string;
    timeoutMs: number | undefined;
  }) =>
    Layer.effect(OutputReporter)(
      Effect.gen(function* () {
        const stdio = yield* Stdio.Stdio;
        const hooks = yield* OutputReporterHooks;
        const write = yield* makeQueueWriter(stdio, "stdout");
        const seenEvents = new Set<string>();

        const timeoutLabel =
          options.timeoutMs !== undefined
            ? ` · timeout ${formatElapsed(options.timeoutMs)}`
            : "";

        yield* write("");
        yield* write(
          ` ${pc.bold(pc.cyan("expect"))}  ${pc.dim("CI")} · ${pc.dim(
            options.agent
          )}${pc.dim(timeoutLabel)}`
        );
        yield* hooks.onGroupOpen();

        return {
          onExecutedPlan: (executed: ExecutedTestPlan) =>
            Effect.gen(function* () {
              for (const event of executed.events) {
                if (seenEvents.has(event.id)) continue;
                seenEvents.add(event.id);
                yield* printEvent(write, event, executed);
                if (event._tag === "StepFailed") {
                  yield* hooks.onStepFailed(event.stepId, event.message);
                }
              }
            }),
          onComplete: (report: TestReport) =>
            Effect.gen(function* () {
              yield* hooks.onGroupClose();
              yield* printSummary(write, report);
              yield* hooks.onReportComplete(report);
            }),
          onTimeout: (timeoutMs: number) =>
            Effect.gen(function* () {
              yield* hooks.onGroupClose();
              yield* write("");
              const message = `Execution timed out after ${formatElapsed(
                timeoutMs
              )}`;
              yield* write(
                ` ${pc.red(figures.cross)} ${pc.red(
                  pc.bold("Timeout")
                )} ${pc.red(message)}`
              );
              yield* hooks.onTimeout(message);
            }),
        };
      })
    ).pipe(Layer.provide(NodeServices.layer));

  static layerStdoutNoop = (options: {
    agent: string;
    timeoutMs: number | undefined;
  }) =>
    this.layerStdout(options).pipe(
      Layer.provideMerge(OutputReporterHooks.layerNoop)
    );

  static layerGitHubActions = (options: {
    agent: string;
    timeoutMs: number | undefined;
  }) =>
    OutputReporter.layerStdout(options).pipe(
      Layer.provideMerge(OutputReporterHooks.layerGitHubActions)
    );

  static layerJson = Layer.effect(OutputReporter)(
    Effect.gen(function* () {
      const stdio = yield* Stdio.Stdio;
      const writeStdout = yield* makeQueueWriter(stdio, "stdout");

      return {
        onExecutedPlan: () => Effect.void,
        onComplete: (report: TestReport) =>
          Effect.gen(function* () {
            const encoded = yield* Schema.encodeEffect(TestReport)(report).pipe(
              Effect.orDie
            );
            yield* writeStdout(JSON.stringify(encoded, undefined, 2));
          }),
        onTimeout: (timeoutMs: number) =>
          writeStdout(
            JSON.stringify(
              { status: "failed", summary: `Timed out after ${timeoutMs}ms` },
              undefined,
              2
            )
          ),
      };
    })
  ).pipe(Layer.provide(NodeServices.layer));
}

const printEvent = (
  write: Writer,
  event: ExecutionEvent,
  executed: ExecutedTestPlan
): Effect.Effect<void> => {
  switch (event._tag) {
    case "RunStarted": {
      const baseUrl = Option.isSome(event.plan.baseUrl)
        ? event.plan.baseUrl.value
        : undefined;
      return Effect.gen(function* () {
        yield* write("");
        yield* write(` ${pc.bold(event.plan.title)}`);
        if (baseUrl) {
          yield* write(` ${pc.dim(baseUrl)}`);
        }
      });
    }
    case "StepStarted":
      return write(` ${pc.dim(figures.circle)} ${pc.dim(event.title)}`);
    case "StepCompleted": {
      const step = executed.steps.find((step) => step.id === event.stepId);
      const timeLabel =
        step?.elapsedMs !== undefined
          ? ` ${pc.dim(`(${formatElapsed(step.elapsedMs)})`)}`
          : "";
      return write(` ${pc.green(figures.tick)} ${event.summary}${timeLabel}`);
    }
    case "StepFailed": {
      const failedStep = executed.steps.find(
        (step) => step.id === event.stepId
      );
      const failedTitle = failedStep?.title ?? event.stepId;
      const timeLabel =
        failedStep?.elapsedMs !== undefined
          ? ` ${pc.dim(`(${formatElapsed(failedStep.elapsedMs)})`)}`
          : "";
      return Effect.gen(function* () {
        yield* write(` ${pc.red(figures.cross)} ${failedTitle}${timeLabel}`);
        yield* write(`   ${pc.red(event.message)}`);
      });
    }
    case "StepSkipped": {
      const skippedStep = executed.steps.find(
        (step) => step.id === event.stepId
      );
      const skippedTitle = skippedStep?.title ?? event.stepId;
      return Effect.gen(function* () {
        yield* write(
          ` ${pc.yellow(figures.arrowRight)} ${skippedTitle} ${pc.yellow(
            "[skipped]"
          )}`
        );
        if (event.reason) {
          yield* write(`   ${pc.dim(event.reason)}`);
        }
      });
    }
    default:
      return Effect.void;
  }
};

const printSummary = (write: Writer, report: TestReport) =>
  Effect.gen(function* () {
    yield* write("");
    const parts: string[] = [];
    if (report.passedStepCount > 0)
      parts.push(pc.green(`${report.passedStepCount} passed`));
    if (report.failedStepCount > 0)
      parts.push(pc.red(`${report.failedStepCount} failed`));
    if (report.skippedStepCount > 0)
      parts.push(pc.yellow(`${report.skippedStepCount} skipped`));
    yield* write(
      ` ${pc.bold("Tests")}  ${parts.join(pc.dim(" | "))} ${pc.dim(
        `(${report.steps.length})`
      )}`
    );
    yield* write(
      ` ${pc.bold("Time")}   ${formatElapsed(report.totalDurationMs)}`
    );
  });
