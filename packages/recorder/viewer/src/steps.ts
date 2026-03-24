interface StepEvent {
  readonly stepId: string;
  readonly title: string;
  readonly status: "pending" | "active" | "passed" | "failed";
  readonly summary: string | undefined;
}

interface RunState {
  readonly title: string;
  readonly status: "running" | "passed" | "failed";
  readonly summary: string | undefined;
  readonly steps: readonly StepEvent[];
}

const STATUS_BADGES: Record<StepEvent["status"], string> = {
  passed: "\u2713",
  failed: "\u2717",
  active: "\u25CF",
  pending: "\u25CB",
};

export const updateSteps = (state: RunState): void => {
  const stepsPanel = document.getElementById("steps-panel");
  const runTitle = document.getElementById("run-title");
  const runStatus = document.getElementById("run-status");
  const runSummary = document.getElementById("run-summary");
  const stepsList = document.getElementById("steps-list");

  if (!stepsPanel || !state) return;

  stepsPanel.style.display = "block";

  if (runTitle) runTitle.textContent = state.title || "Test Run";

  if (runStatus) {
    runStatus.textContent = state.status;
    runStatus.className = `run-status status-${state.status}`;
  }

  if (runSummary) {
    runSummary.textContent = state.summary ?? "";
    runSummary.style.display = state.summary ? "block" : "none";
  }

  if (stepsList && state.steps) {
    stepsList.innerHTML = "";
    for (const step of state.steps) {
      const listItem = document.createElement("li");
      listItem.className = `step-item step-${step.status}`;

      const badge = document.createElement("span");
      badge.className = "step-badge";
      badge.textContent = STATUS_BADGES[step.status];

      const title = document.createElement("span");
      title.className = "step-title";
      title.textContent = step.title;

      listItem.appendChild(badge);
      listItem.appendChild(title);

      if (step.summary) {
        const summary = document.createElement("span");
        summary.className = "step-summary";
        summary.textContent = step.summary;
        listItem.appendChild(summary);
      }

      stepsList.appendChild(listItem);
    }
  }
};
