import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";

export type AgentProvider = "claude" | "codex" | "cursor";

export interface DiffStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
}

export interface ChangedFile {
  path: string;
  status: string;
}

export interface TestTargetBranch {
  current: string;
  main: string | null;
}

export type TestAction = "test-unstaged" | "test-branch" | "test-changes" | "select-commit";

export interface TestTargetSelection {
  action: TestAction;
  commitHash?: string;
  commitShortHash?: string;
  commitSubject?: string;
}

export interface TestTarget {
  scope: "unstaged" | "branch" | "changes" | "commit";
  cwd: string;
  branch: TestTargetBranch;
  displayName: string;
  diffStats: DiffStats | null;
  branchDiffStats: DiffStats | null;
  changedFiles: ChangedFile[];
  recentCommits: CommitSummary[];
  diffPreview: string;
  selectedCommit?: CommitSummary;
}

export interface ResolveTestTargetOptions {
  cwd?: string;
  selection: TestTargetSelection;
}

export interface PlanStep {
  id: string;
  title: string;
  instruction: string;
  expectedOutcome: string;
  routeHint?: string;
  changedFileEvidence?: string[];
}

export interface BrowserFlowCookieSync {
  required: boolean;
  reason: string;
}

export interface BrowserFlowPlan {
  title: string;
  rationale: string;
  targetSummary: string;
  userInstruction: string;
  assumptions: string[];
  riskAreas: string[];
  targetUrls: string[];
  cookieSync: BrowserFlowCookieSync;
  steps: PlanStep[];
}

export interface BrowserRunFinding {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  stepId?: string;
  stepTitle?: string;
}

export interface BrowserRunStepResult {
  stepId: string;
  title: string;
  status: "passed" | "failed" | "not-run";
  summary: string;
}

export interface BrowserRunPullRequest {
  number: number;
  url: string;
  title: string;
  headRefName: string;
}

export interface BrowserRunArtifacts {
  rawVideoPath?: string;
  highlightVideoPath?: string;
  screenshotPaths: string[];
  shareBundlePath?: string;
  shareSummaryPath?: string;
  shareUrl?: string;
}

export interface BrowserRunReport {
  title: string;
  status: "passed" | "failed";
  summary: string;
  findings: BrowserRunFinding[];
  stepResults: BrowserRunStepResult[];
  confirmedRiskAreas: string[];
  clearedRiskAreas: string[];
  unresolvedRiskAreas: string[];
  warnings: string[];
  pullRequest: BrowserRunPullRequest | null;
  artifacts: BrowserRunArtifacts;
}

export interface BrowserEnvironmentHints {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export interface PlanBrowserFlowOptions {
  target: TestTarget;
  userInstruction: string;
  environment?: BrowserEnvironmentHints;
  provider?: AgentProvider;
  providerSettings?: AgentProviderSettings;
  model?: LanguageModelV3;
}

export interface ExecuteBrowserFlowOptions {
  target: TestTarget;
  plan: BrowserFlowPlan;
  environment?: BrowserEnvironmentHints;
  provider?: AgentProvider;
  providerSettings?: AgentProviderSettings;
  model?: LanguageModelV3;
  browserMcpServerName?: string;
  videoOutputPath?: string;
  liveViewUrl?: string;
}
