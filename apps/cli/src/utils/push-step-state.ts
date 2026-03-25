import { Effect, Option } from "effect";
import type { ExecutedTestPlan } from "@expect/shared/models";
import type { ViewerRunState, ViewerStepEvent } from "@expect/browser/mcp";

export const toViewerRunState = (executed: ExecutedTestPlan): ViewerRunState => {
  const runFinishedEvent = executed.events.find((event) => event._tag === "RunFinished");

  const status: ViewerRunState["status"] =
    runFinishedEvent && runFinishedEvent._tag === "RunFinished"
      ? runFinishedEvent.status
      : "running";

  const summary =
    runFinishedEvent && runFinishedEvent._tag === "RunFinished"
      ? runFinishedEvent.summary
      : undefined;

  const steps: ViewerStepEvent[] = executed.steps.map((step) => ({
    stepId: step.id,
    title: step.title,
    status: step.status,
    summary: Option.isSome(step.summary) ? step.summary.value : undefined,
  }));

  return {
    title: executed.title,
    status,
    summary,
    steps,
  };
};

export const pushStepState = Effect.fn("pushStepState")(function* (
  liveViewUrl: string,
  state: ViewerRunState,
) {
  yield* Effect.tryPromise(() =>
    fetch(`${liveViewUrl}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }),
  ).pipe(Effect.catchCause(() => Effect.void));
});
