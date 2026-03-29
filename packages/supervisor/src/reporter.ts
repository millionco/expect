import { Effect, Layer, Option, ServiceMap } from "effect";
import { type ExecutedTestPlan, TestReport } from "@expect/shared/models";

export class Reporter extends ServiceMap.Service<Reporter>()("@supervisor/Reporter", {
  make: Effect.gen(function* () {
    const report = Effect.fn("Reporter.report")(function* (executed: ExecutedTestPlan) {
      const failedSteps = executed.events.filter((event) => event._tag === "StepFailed");
      const completedSteps = executed.events.filter((event) => event._tag === "StepCompleted");
      const runFinished = executed.events.find((event) => event._tag === "RunFinished");

      const summary = runFinished
        ? runFinished.summary
        : failedSteps.length > 0
          ? `${failedSteps.length} step${failedSteps.length === 1 ? "" : "s"} failed, ${completedSteps.length} passed`
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

      return new TestReport({
        ...executed,
        summary,
        screenshotPaths,
        pullRequest: Option.none(),
        testCoverageReport: executed.testCoverage,
      });
    });

    return { report } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
