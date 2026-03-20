import type { BrowserFlowPlan } from "./types.js";
import type { BrowserRunEvent } from "./events.js";

const RUN_STATUS_LABELS = new Set([
  "Analyzing results",
  "Looking up pull request",
  "Building report",
]);

export interface StepDisplayState {
  stepId: string;
  status: "pending" | "active" | "passed" | "failed";
  label: string;
  elapsedMs: number | null;
}

export interface DerivedTestingState {
  steps: StepDisplayState[];
  completedCount: number;
  totalCount: number;
  runStatusLabel: string;
}

export const deriveTestingState = (
  plan: BrowserFlowPlan,
  events: BrowserRunEvent[],
): DerivedTestingState => {
  const stepStateById = new Map<string, StepDisplayState>();

  for (const step of plan.steps) {
    stepStateById.set(step.id, {
      stepId: step.id,
      status: "pending",
      label: step.title,
      elapsedMs: null,
    });
  }

  let activeStepId: string | null = null;
  let runStatusLabel = "Testing";
  let hasRunStarted = false;
  let hasRunCompleted = false;
  let runStartedAt: number | null = null;

  const activateNextPendingStep = () => {
    for (const planStep of plan.steps) {
      const state = stepStateById.get(planStep.id);
      if (state?.status === "pending") {
        state.status = "active";
        activeStepId = state.stepId;
        return;
      }
    }
  };

  for (const event of events) {
    switch (event.type) {
      case "run-started": {
        hasRunStarted = true;
        runStartedAt = event.timestamp;
        if (activeStepId === null) {
          activateNextPendingStep();
        }
        break;
      }
      case "step-started": {
        if (activeStepId && activeStepId !== event.stepId) {
          const previousActiveStepState = stepStateById.get(activeStepId);
          if (previousActiveStepState?.status === "active") {
            previousActiveStepState.status = "passed";
            if (runStartedAt !== null) {
              previousActiveStepState.elapsedMs = Math.round(event.timestamp - runStartedAt);
            }
          }
        }
        const stepState = stepStateById.get(event.stepId);
        if (stepState) {
          stepState.status = "active";
          activeStepId = event.stepId;
        }
        break;
      }
      case "step-completed": {
        const stepState = stepStateById.get(event.stepId);
        if (stepState) {
          stepState.status = "passed";
          stepState.label = event.summary;
          if (runStartedAt !== null) {
            stepState.elapsedMs = Math.round(event.timestamp - runStartedAt);
          }
          if (activeStepId === event.stepId) {
            activeStepId = null;
          }
        }
        if (activeStepId === null) {
          activateNextPendingStep();
        }
        break;
      }
      case "assertion-failed": {
        const stepState = stepStateById.get(event.stepId);
        if (stepState) {
          stepState.status = "failed";
          stepState.label = event.message;
          if (runStartedAt !== null) {
            stepState.elapsedMs = Math.round(event.timestamp - runStartedAt);
          }
          if (activeStepId === event.stepId) {
            activeStepId = null;
          }
        }
        if (activeStepId === null) {
          activateNextPendingStep();
        }
        break;
      }
      case "run-completed": {
        hasRunCompleted = true;
        break;
      }
      case "text": {
        if (RUN_STATUS_LABELS.has(event.text)) {
          runStatusLabel = event.text;
        }
        break;
      }
    }
  }

  if (hasRunStarted && !hasRunCompleted && activeStepId === null) {
    activateNextPendingStep();
  }

  const steps = plan.steps.map(
    (planStep): StepDisplayState =>
      stepStateById.get(planStep.id) ?? {
        stepId: planStep.id,
        status: "pending",
        label: planStep.title,
        elapsedMs: null,
      },
  );

  const completedCount = steps.filter(
    (step) => step.status === "passed" || step.status === "failed",
  ).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    runStatusLabel,
  };
};
