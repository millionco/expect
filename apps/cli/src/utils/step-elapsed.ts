import { DateTime, Option } from "effect";
import type { TestPlanStep } from "@expect/shared/models";

export const getStepElapsedMs = (step: TestPlanStep): number | undefined => {
  if (Option.isNone(step.startedAt) || Option.isNone(step.endedAt)) return undefined;
  return DateTime.toEpochMillis(step.endedAt.value) - DateTime.toEpochMillis(step.startedAt.value);
};

export const getTotalElapsedMs = (steps: readonly TestPlanStep[]): number => {
  let totalMs = 0;
  for (const step of steps) {
    const elapsed = getStepElapsedMs(step);
    if (elapsed !== undefined) totalMs += elapsed;
  }
  return totalMs;
};
