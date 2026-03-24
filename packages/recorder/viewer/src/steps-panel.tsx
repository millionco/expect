import type { ExecutedTestPlan, StepStatus } from "@expect/shared/models";
import { cn } from "@/lib/utils";

type RunStatus = "running" | "passed" | "failed";

const STATUS_BADGES: Record<StepStatus, string> = {
  pending: "\u25CB",
  active: "\u25CF",
  passed: "\u2713",
  failed: "\u2717",
};

const STATUS_BADGE_COLORS: Record<StepStatus, string> = {
  pending: "text-muted-foreground",
  active: "text-blue-400 animate-pulse",
  passed: "text-green-400",
  failed: "text-red-400",
};

const RUN_STATUS_STYLES: Record<RunStatus, string> = {
  running: "bg-blue-950 text-blue-400",
  passed: "bg-green-950 text-green-400",
  failed: "bg-red-950 text-red-400",
};

const deriveRunStatus = (plan: ExecutedTestPlan): RunStatus => {
  const finished = plan.events.find((event) => event._tag === "RunFinished");
  if (finished && finished._tag === "RunFinished") return finished.status;
  return "running";
};

const deriveRunSummary = (plan: ExecutedTestPlan): string | undefined => {
  const finished = plan.events.find((event) => event._tag === "RunFinished");
  if (finished && finished._tag === "RunFinished") return finished.summary;
  return undefined;
};

interface StepsPanelProps {
  readonly executedPlan: ExecutedTestPlan | undefined;
}

export const StepsPanel = ({ executedPlan }: StepsPanelProps) => {
  if (!executedPlan || executedPlan.steps.length === 0) return null;

  const runStatus = deriveRunStatus(executedPlan);
  const runSummary = deriveRunSummary(executedPlan);

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-5">
      <h2 className="mb-1 text-base font-semibold text-card-foreground">{executedPlan.title}</h2>
      <div
        className={cn(
          "mb-3 inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
          RUN_STATUS_STYLES[runStatus],
        )}
      >
        {runStatus}
      </div>
      {runSummary && <div className="mb-4 text-[13px] text-muted-foreground">{runSummary}</div>}
      <ul className="m-0 list-none p-0">
        {executedPlan.steps.map((step) => (
          <li
            key={step.id}
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
            {step.summary._tag === "Some" && (
              <span className="ml-auto max-w-[50%] truncate text-right text-xs text-muted-foreground">
                {step.summary.value}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
