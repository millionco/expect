import { DateTime, Effect, Option } from "effect";
import type { ExecutedTestPlan } from "@expect/shared/models";
import type { ViewerRunState, ViewerStepEvent } from "@expect/browser/mcp";

const optionDateTimeToMs = (value: Option.Option<DateTime.DateTime>): number | undefined =>
  Option.isSome(value) ? Number(DateTime.toEpochMillis(value.value)) : undefined;

const deriveStatusFromSteps = (steps: ExecutedTestPlan["steps"]): ViewerRunState["status"] => {
  if (steps.length === 0) return "running";
  const allDone = steps.every((step) => step.status === "passed" || step.status === "failed");
  if (!allDone) return "running";
  const anyFailed = steps.some((step) => step.status === "failed");
  return anyFailed ? "failed" : "passed";
};

export const toViewerRunState = (executed: ExecutedTestPlan): ViewerRunState => {
  const runFinishedEvent = executed.events.find((event) => event._tag === "RunFinished");

  const status: ViewerRunState["status"] =
    runFinishedEvent && runFinishedEvent._tag === "RunFinished"
      ? runFinishedEvent.status
      : deriveStatusFromSteps(executed.steps);

  const summary =
    runFinishedEvent && runFinishedEvent._tag === "RunFinished"
      ? runFinishedEvent.summary
      : undefined;

  const steps: ViewerStepEvent[] = executed.steps.map((step) => ({
    stepId: step.id,
    title: step.title,
    status: step.status,
    summary: Option.isSome(step.summary) ? step.summary.value : undefined,
    startedAtMs: optionDateTimeToMs(step.startedAt),
    endedAtMs: optionDateTimeToMs(step.endedAt),
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
