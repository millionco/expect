import { Effect, FileSystem, Layer, Option, Path, Schema, ServiceMap, Stream } from "effect";
import { Artifact, type ExecutedTestPlan, RrwebEvent, TestReport } from "@expect/shared/models";
import { RrVideo } from "@expect/browser";
import { GitRepoRoot } from "./git/git";
import { EXPECT_STATE_DIR } from "./constants";
import { NodeServices } from "@effect/platform-node";
import { Ndjson } from "effect/unstable/encoding";

export interface ExportVideoOptions {
  exportPathOverride?: string;
}

export class Reporter extends ServiceMap.Service<Reporter>()("@supervisor/Reporter", {
  make: Effect.gen(function* () {
    const rrvideo = yield* RrVideo;
    const fs = yield* FileSystem.FileSystem;
    const repoRoot = yield* GitRepoRoot;
    const path = yield* Path.Path;

    const report = Effect.fn("Reporter.report")(function* (executed: ExecutedTestPlan) {
      const failedSteps = executed.events.filter((event) => event._tag === "StepFailed");
      const completedSteps = executed.events.filter((event) => event._tag === "StepCompleted");
      const runFinished = executed.events.find((event) => event._tag === "RunFinished");

      const summary = runFinished
        ? runFinished.summary
        : failedSteps.length > 0
          ? `${failedSteps.length} step${
              failedSteps.length === 1 ? "" : "s"
            } failed, ${completedSteps.length} passed`
          : `${completedSteps.length} step${completedSteps.length === 1 ? "" : "s"} completed`;

      const screenshotPaths = executed.events
        .filter(
          (event) =>
            event._tag === "ToolResult" &&
            event.toolName.endsWith("__screenshot") &&
            !event.isError,
        )
        .map((event) => (event._tag === "ToolResult" ? event.result : ""))
        .filter(Boolean);

      const report = new TestReport({
        ...executed,
        summary,
        screenshotPaths,
        pullRequest: Option.none(),
        testCoverageReport: executed.testCoverage,
      });

      yield* Effect.logInfo("Report generated", {
        status: report.status,
        stepCount: executed.steps.length,
        passedCount: completedSteps.length,
        failedCount: failedSteps.length,
        screenshotCount: screenshotPaths.length,
      });

      return report;
    });

    const exportVideo = Effect.fn("Reporter.exportVideo")(function* (
      report: TestReport,
      options?: ExportVideoOptions,
    ) {
      yield* Effect.logInfo(`Generating a video for report for test "${report.title}"`);

      const events = yield* fs
        .stream(path.join(repoRoot, EXPECT_STATE_DIR, `artifacts`, `${report.id}.ndjson`))
        .pipe(
          Stream.pipeThroughChannel(
            Ndjson.decodeSchema(Schema.toCodecJson(Artifact))({
              ignoreEmptyLines: true,
            }),
          ),
          Stream.filter((a): a is RrwebEvent => a._tag === "RrwebEvent"),
          Stream.map((a) => a.event),
          Stream.runCollect,
        );

      yield* rrvideo.convertEvents({
        events: events as any[],
        outputPath:
          options?.exportPathOverride ??
          path.join(repoRoot, EXPECT_STATE_DIR, `videos`, `${report.id}.mp4`),
      });
      return report;
    });

    return { report, exportVideo } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provide(RrVideo.layer),
  );
}
