interface DemoStepDefinition {
  readonly stepId: string;
  readonly title: string;
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
}

export const DEMO_TARGET_URL = "https://expect.dev";

export const DEMO_STEP_DEFINITIONS: readonly DemoStepDefinition[] = [
  {
    stepId: "demo-step-1",
    title: "Navigate to expect.dev and let the homepage intro animation settle",
    startOffsetMs: 0,
    endOffsetMs: 6_000,
  },
  {
    stepId: "demo-step-2",
    title: "Scroll down to the installation section",
    startOffsetMs: 6_000,
    endOffsetMs: 11_000,
  },
  {
    stepId: "demo-step-3",
    title: "Copy the install command",
    startOffsetMs: 11_000,
    endOffsetMs: 15_000,
  },
  {
    stepId: "demo-step-4",
    title: "Copy the Cursor skill command",
    startOffsetMs: 15_000,
    endOffsetMs: 19_000,
  },
  {
    stepId: "demo-step-5",
    title: "Switch the homepage to dark mode",
    startOffsetMs: 19_000,
    endOffsetMs: 24_000,
  },
  {
    stepId: "demo-step-6",
    title: "Switch back to light mode and return to the top of the page",
    startOffsetMs: 24_000,
    endOffsetMs: 30_000,
  },
] as const;
