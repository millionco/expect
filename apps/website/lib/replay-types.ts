export interface ViewerStepEvent {
  readonly stepId: string;
  readonly title: string;
  readonly status: "pending" | "active" | "passed" | "failed";
  readonly summary: string | undefined;
}

export interface ViewerRunState {
  readonly title: string;
  readonly status: "running" | "passed" | "failed";
  readonly summary: string | undefined;
  readonly steps: readonly ViewerStepEvent[];
}
