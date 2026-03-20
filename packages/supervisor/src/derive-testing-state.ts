import type { BrowserRunEvent } from "./events";
import { formatBrowserToolCall } from "./utils/format-browser-tool-call";

const TOOL_CALL_HIDDEN = "hidden";
const TOOL_CALL_DETAILED = "detailed";
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
  currentToolCallText: string | null;
  completedCount: number;
  totalCount: number;
  runStatusLabel: string;
}

export const deriveTestingState = (
  events: BrowserRunEvent[],
  toolCallDisplayMode: string,
): DerivedTestingState => {
  const stepStateById = new Map<string, StepDisplayState>();
  const stepOrder: string[] = [];

  let activeStepId: string | null = null;
  let currentToolCallText: string | null = null;
  let runStatusLabel = "Testing";
  let runStartedAt: number | null = null;

  const ensureStepState = (stepId: string, title: string): StepDisplayState => {
    const existingStepState = stepStateById.get(stepId);
    if (existingStepState) {
      if (existingStepState.label !== title && existingStepState.status === "pending") {
        existingStepState.label = title;
      }
      return existingStepState;
    }

    const nextStepState: StepDisplayState = {
      stepId,
      status: "pending",
      label: title,
      elapsedMs: null,
    };
    stepStateById.set(stepId, nextStepState);
    stepOrder.push(stepId);
    return nextStepState;
  };

  const finalizeStep = (
    stepId: string,
    status: "passed" | "failed",
    label: string,
    timestamp: number,
  ) => {
    const stepState = ensureStepState(stepId, stepId);
    stepState.status = status;
    stepState.label = label;
    if (runStartedAt !== null) {
      stepState.elapsedMs = Math.round(timestamp - runStartedAt);
    }
  };

  for (const event of events) {
    switch (event.type) {
      case "run-started": {
        runStartedAt = event.timestamp;
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
        const stepState = ensureStepState(event.stepId, event.title);
        stepState.status = "active";
        stepState.label = event.title;
        activeStepId = event.stepId;
        currentToolCallText = null;
        break;
      }
      case "step-completed": {
        finalizeStep(event.stepId, "passed", event.summary, event.timestamp);
        if (activeStepId === event.stepId) {
          activeStepId = null;
          currentToolCallText = null;
        }
        break;
      }
      case "assertion-failed": {
        finalizeStep(event.stepId, "failed", event.message, event.timestamp);
        if (activeStepId === event.stepId) {
          activeStepId = null;
          currentToolCallText = null;
        }
        break;
      }
      case "tool-call": {
        if (activeStepId && toolCallDisplayMode !== TOOL_CALL_HIDDEN) {
          const formatted = formatBrowserToolCall(event.toolName, event.input, {
            includeRelevantInputs: toolCallDisplayMode === TOOL_CALL_DETAILED,
          });
          if (formatted) {
            currentToolCallText = `${formatted} ${event.input}`;
          }
        }
        break;
      }
      case "run-completed": {
        if (activeStepId) {
          finalizeStep(activeStepId, event.status, event.summary, event.timestamp);
          activeStepId = null;
          currentToolCallText = null;
        }
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

  const steps = stepOrder.map(
    (stepId): StepDisplayState =>
      stepStateById.get(stepId) ?? {
        stepId,
        status: "pending",
        label: stepId,
        elapsedMs: null,
      },
  );

  const completedCount = steps.filter(
    (step) => step.status === "passed" || step.status === "failed",
  ).length;

  return {
    steps,
    currentToolCallText,
    completedCount,
    totalCount: steps.length,
    runStatusLabel,
  };
};
