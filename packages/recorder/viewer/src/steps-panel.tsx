import type { ViewerRunState, ViewerStepEvent } from "../../src/viewer-events";
import { cn } from "@/lib/utils";

const STATUS_BADGES: Record<ViewerStepEvent["status"], string> = {
  passed: "\u2713",
  failed: "\u2717",
  active: "\u25CF",
  pending: "\u25CB",
};

const STATUS_BADGE_COLORS: Record<ViewerStepEvent["status"], string> = {
  pending: "text-muted-foreground",
  active: "text-blue-400 animate-pulse",
  passed: "text-green-400",
  failed: "text-red-400",
};

const RUN_STATUS_STYLES: Record<ViewerRunState["status"], string> = {
  running: "bg-blue-950 text-blue-400",
  passed: "bg-green-950 text-green-400",
  failed: "bg-red-950 text-red-400",
};

interface StepsPanelProps {
  readonly state: ViewerRunState | undefined;
}

export const StepsPanel = ({ state }: StepsPanelProps) => {
  if (!state) return null;

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-5">
      <h2 className="mb-1 text-base font-semibold text-card-foreground">
        {state.title || "Test Run"}
      </h2>
      <div
        className={cn(
          "mb-3 inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
          RUN_STATUS_STYLES[state.status],
        )}
      >
        {state.status}
      </div>
      {state.summary && (
        <div className="mb-4 text-[13px] text-muted-foreground">{state.summary}</div>
      )}
      <ul className="m-0 list-none p-0">
        {state.steps.map((step) => (
          <li
            key={step.stepId}
            className="flex items-baseline gap-2 border-t border-border py-1.5 text-sm first:border-t-0"
          >
            <span
              className={cn(
                "w-4 shrink-0 text-center text-[13px]",
                STATUS_BADGE_COLORS[step.status],
              )}
            >
              {STATUS_BADGES[step.status]}
            </span>
            <span className="text-foreground">{step.title}</span>
            {step.summary && (
              <span className="ml-auto max-w-[50%] truncate text-right text-xs text-muted-foreground">
                {step.summary}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
