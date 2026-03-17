import type { BrowserFlowPlan, BrowserRunEvent } from "@browser-tester/supervisor";
import { formatBrowserToolCall } from "./format-browser-tool-call.js";

const TOOL_CALL_HIDDEN = "hidden";
const TOOL_CALL_DETAILED = "detailed";
const RUN_STATUS_LABELS = new Set([
  "Analyzing results",
  "Looking up pull request",
  "Generating highlight video",
  "Building report",
]);

export interface StepDisplayState {
  stepId: string;
  status: "pending" | "active" | "passed" | "failed";
  label: string;
}

export interface DerivedTestingState {
  steps: StepDisplayState[];
  currentToolCallText: string | null;
  activeStepStartedAt: number | null;
  completedCount: number;
  totalCount: number;
  runStatusLabel: string;
}

export const deriveTestingState = (
  plan: BrowserFlowPlan,
  events: BrowserRunEvent[],
  toolCallDisplayMode: string,
): DerivedTestingState => {
  const stepStateById = new Map<string, StepDisplayState>();

  for (const step of plan.steps) {
    stepStateById.set(step.id, {
      stepId: step.id,
      status: "pending",
      label: step.title,
    });
  }

  let activeStepId: string | null = null;
  let activeStepStartedAt: number | null = null;
  let currentToolCallText: string | null = null;
  let runStatusLabel = "Testing";
  let hasRunStarted = false;
  let hasRunCompleted = false;

  const activateNextPendingStep = (timestamp: number) => {
    for (const planStep of plan.steps) {
      const state = stepStateById.get(planStep.id);
      if (state?.status === "pending") {
        state.status = "active";
        activeStepId = state.stepId;
        activeStepStartedAt = timestamp;
        currentToolCallText = null;
        return;
      }
    }
  };

  for (const event of events) {
    switch (event.type) {
      case "run-started": {
        hasRunStarted = true;
        if (activeStepId === null) {
          activateNextPendingStep(event.timestamp);
        }
        break;
      }
      case "step-started": {
        if (activeStepId && activeStepId !== event.stepId) {
          const previousActiveStepState = stepStateById.get(activeStepId);
          if (previousActiveStepState?.status === "active") {
            previousActiveStepState.status = "passed";
          }
        }
        const stepState = stepStateById.get(event.stepId);
        if (stepState) {
          stepState.status = "active";
          activeStepId = event.stepId;
          activeStepStartedAt = event.timestamp;
          currentToolCallText = null;
        }
        break;
      }
      case "step-completed": {
        const stepState = stepStateById.get(event.stepId);
        if (stepState) {
          stepState.status = "passed";
          stepState.label = event.summary;
          if (activeStepId === event.stepId) {
            activeStepId = null;
            activeStepStartedAt = null;
            currentToolCallText = null;
          }
        }
        if (activeStepId === null) {
          activateNextPendingStep(event.timestamp);
        }
        break;
      }
      case "assertion-failed": {
        const stepState = stepStateById.get(event.stepId);
        if (stepState) {
          stepState.status = "failed";
          stepState.label = event.message;
          if (activeStepId === event.stepId) {
            activeStepId = null;
            activeStepStartedAt = null;
            currentToolCallText = null;
          }
        }
        if (activeStepId === null) {
          activateNextPendingStep(event.timestamp);
        }
        break;
      }
      case "tool-call": {
        if (activeStepId && toolCallDisplayMode !== TOOL_CALL_HIDDEN) {
          const formatted = formatBrowserToolCall(event.toolName, event.input, {
            includeRelevantInputs: toolCallDisplayMode === TOOL_CALL_DETAILED,
          });
          if (formatted) {
            currentToolCallText = formatted;
          }
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
    activateNextPendingStep(events[events.length - 1]?.timestamp ?? Date.now());
  }

  const steps = plan.steps.map(
    (planStep): StepDisplayState =>
      stepStateById.get(planStep.id) ?? {
        stepId: planStep.id,
        status: "pending",
        label: planStep.title,
      },
  );

  const completedCount = steps.filter(
    (step) => step.status === "passed" || step.status === "failed",
  ).length;

  return {
    steps,
    currentToolCallText,
    activeStepStartedAt,
    completedCount,
    totalCount: steps.length,
    runStatusLabel,
  };
};
