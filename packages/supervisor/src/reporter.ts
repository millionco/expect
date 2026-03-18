import { Effect, Layer, ServiceMap } from "effect";
import type { ExecutedTestPlan } from "./models.js";
import { RunCompleted } from "./models.js";
import { Updates } from "./updates.js";

export class Reporter extends ServiceMap.Service<Reporter>()("@supervisor/Reporter", {
  make: Effect.gen(function* () {
    const updates = yield* Updates;

    const report = Effect.fn("Reporter.report")(function* (executed: ExecutedTestPlan) {
      const testReport = executed.testReport;
      yield* updates.publish(new RunCompleted({ report: testReport }));
      return testReport;
    });

    return { report } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Updates.layer));
}
