import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";
import type { ChangedFile, ChangesFor, CommitSummary, FileStat } from "./git/index.js";

export type AgentProvider = "claude" | "codex" | "cursor";

export type TestAction = "test-unstaged" | "test-branch" | "test-changes" | "select-commit";

export interface TestTargetSelection {
  action: TestAction;
  commitHash?: string;
  commitShortHash?: string;
  commitSubject?: string;
}

export interface TestTarget {
  changesFor: ChangesFor;
  scope: "unstaged" | "branch" | "changes" | "commit";
  cwd: string;
  currentBranch: string;
  mainBranch: string;
  displayName: string;
  fileStats: readonly FileStat[];
  changedFiles: readonly ChangedFile[];
  recentCommits: readonly CommitSummary[];
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
