export interface DemoStepDefinition {
  readonly stepId: string;
  readonly title: string;
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
}

export const DEMO_TARGET_URL = "http://localhost:5173";

export const DEMO_STEP_DEFINITIONS: readonly DemoStepDefinition[] = [
  {
    stepId: "demo-step-1",
    title: "Navigate to InvoiceApp and verify the dashboard loads",
    startOffsetMs: 0,
    endOffsetMs: 2_000,
  },
  {
    stepId: "demo-step-2",
    title: "Click New Invoice and submit empty form — no validation",
    startOffsetMs: 2_000,
    endOffsetMs: 4_500,
  },
  {
    stepId: "demo-step-3",
    title: "Resize to mobile viewport (375px) — table overflows",
    startOffsetMs: 4_500,
    endOffsetMs: 6_000,
  },
  {
    stepId: "demo-step-4",
    title: "Check accessibility — 4 WCAG violations found",
    startOffsetMs: 6_000,
    endOffsetMs: 7_500,
  },
  {
    stepId: "demo-step-5",
    title: "Delete invoice has no confirmation dialog",
    startOffsetMs: 7_500,
    endOffsetMs: 8_500,
  },
  {
    stepId: "demo-step-6",
    title: "Review results — 5 issues found, 3 videos saved",
    startOffsetMs: 8_500,
    endOffsetMs: 10_000,
  },
] as const;
