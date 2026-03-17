export interface BrowserEnvironmentHints {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export interface PlanStep {
  id: string;
  routeHint?: string;
}

export interface BrowserFlowPlan {
  title: string;
  userInstruction: string;
  targetUrls: string[];
  steps: PlanStep[];
}

export interface BrowserRunFinding {
  title: string;
  detail: string;
}

export interface BrowserRunStepResult {
  stepId: string;
  title: string;
  status: "passed" | "failed" | "not-run";
  summary: string;
}

export interface BrowserRunReport {
  status: "passed" | "failed";
  stepResults: BrowserRunStepResult[];
  findings: BrowserRunFinding[];
}

export interface ChangedFile {
  path: string;
}

export interface TestTargetBranch {
  current: string;
}

export interface TestTarget {
  scope: "unstaged" | "changes" | "branch" | "commit";
  branch: TestTargetBranch;
  changedFiles: ChangedFile[];
}
