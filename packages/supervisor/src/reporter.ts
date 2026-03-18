import { Effect, Layer, ServiceMap } from "effect";
import type { ExecutedTestPlan, TestReport } from "@browser-tester/shared/models";

export class Reporter extends ServiceMap.Service<Reporter>()("@supervisor/Reporter", {
  make: Effect.gen(function* () {
    const report = Effect.fn("Reporter.report")(function* (executed: ExecutedTestPlan) {
      return executed.testReport as TestReport;
    });

    return { report } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
