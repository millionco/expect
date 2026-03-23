import type { ViewerRunState } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const STATUS_BADGE_VARIANT = {
  running: "default",
  passed: "secondary",
  failed: "destructive",
} as const;

const STEP_BADGE_VARIANT = {
  pending: "outline",
  active: "default",
  passed: "secondary",
  failed: "destructive",
} as const;

export const StepPanel = ({ state }: { state: ViewerRunState }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-2">
        <CardTitle>{state.title || "Test Run"}</CardTitle>
        <Badge variant={STATUS_BADGE_VARIANT[state.status]}>{state.status}</Badge>
      </div>
      {state.summary && <CardDescription>{state.summary}</CardDescription>}
    </CardHeader>
    {state.steps.length > 0 && (
      <CardContent>
        <ul className="space-y-1">
          {state.steps.map((step) => (
            <li key={step.stepId} className="flex items-center gap-2 text-sm">
              <Badge variant={STEP_BADGE_VARIANT[step.status]} className="text-[10px]">
                {step.status}
              </Badge>
              <span>{step.title}</span>
              {step.summary && (
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[50%] text-right">
                  {step.summary}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    )}
  </Card>
);
