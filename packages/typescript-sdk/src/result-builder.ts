import { DateTime, Option } from "effect";
import type { ExecutedTestPlan, TestPlanStep, ExecutionEvent } from "@expect/shared/models";
import type { StepResult, TestResult, TestEvent } from "./types";

const stepDurationMs = (step: TestPlanStep): number => {
  if (Option.isNone(step.startedAt)) return 0;
  if (Option.isNone(step.endedAt))
    return Date.now() - Number(DateTime.toEpochMillis(step.startedAt.value));
  return (
    Number(DateTime.toEpochMillis(step.endedAt.value)) -
    Number(DateTime.toEpochMillis(step.startedAt.value))
  );
};

const stepStatusToResultStatus = (status: string): "pending" | "passed" | "failed" => {
  if (status === "passed") return "passed";
  if (status === "failed" || status === "skipped") return "failed";
  return "pending";
};

export const buildStepResult = (step: TestPlanStep): StepResult => ({
  title: step.title,
  status: stepStatusToResultStatus(step.status),
  summary: Option.getOrElse(step.summary, () => ""),
  duration: stepDurationMs(step),
});

export const buildTestResult = (
  executed: ExecutedTestPlan,
  url: string,
  startedAt: number,
): TestResult => {
  const steps = executed.steps.map(buildStepResult);
  const errors = steps.filter((step) => step.status === "failed");
  const hasFailure = errors.length > 0;
  const hasPending = steps.some((step) => step.status === "pending");

  let status: TestResult["status"] = "passed";
  if (hasFailure) status = "failed";
  else if (hasPending || steps.length === 0) status = "pending";

  return { status, url, duration: Date.now() - startedAt, steps, errors };
};

const mapExecutionEvent = (
  event: ExecutionEvent,
  stepMap: ReadonlyMap<string, TestPlanStep>,
  executed: ExecutedTestPlan,
  url: string,
  startedAt: number,
): TestEvent | undefined => {
  switch (event._tag) {
    case "RunStarted":
      return {
        type: "run:started",
        title: event.plan.title,
        baseUrl: Option.getOrUndefined(event.plan.baseUrl),
      };
    case "StepStarted":
      return { type: "step:started", title: event.title };
    case "StepCompleted": {
      const step = stepMap.get(event.stepId);
      return step ? { type: "step:passed", step: buildStepResult(step) } : undefined;
    }
    case "StepFailed": {
      const step = stepMap.get(event.stepId);
      return step ? { type: "step:failed", step: buildStepResult(step) } : undefined;
    }
    case "StepSkipped":
      return {
        type: "step:skipped",
        title: stepMap.get(event.stepId)?.title ?? event.stepId,
        reason: event.reason,
      };
    case "ToolResult":
      return event.toolName.endsWith("__screenshot") && !event.isError
        ? { type: "screenshot", title: event.toolName, path: event.result }
        : undefined;
    case "RunFinished":
      return { type: "completed", result: buildTestResult(executed, url, startedAt) };
    default:
      return undefined;
  }
};

export const diffEvents = (
  previous: readonly ExecutionEvent[],
  current: readonly ExecutionEvent[],
  executed: ExecutedTestPlan,
  url: string,
  startedAt: number,
): TestEvent[] => {
  const stepMap = new Map(executed.steps.map((step) => [step.id as string, step]));
  const newEvents = current.slice(previous.length);

  return newEvents
    .map((event) => mapExecutionEvent(event, stepMap, executed, url, startedAt))
    .filter((event): event is TestEvent => event !== undefined);
};
