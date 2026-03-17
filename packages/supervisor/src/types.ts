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
  replaySessionPath?: string;
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
  warnings: string[];
  pullRequest: BrowserRunPullRequest | null;
  artifacts: BrowserRunArtifacts;
}

export interface BrowserEnvironmentHints {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export interface FlowStep {
  id: string;
  title: string;
  instruction: string;
  expectedOutcome: string;
}

export interface SavedFlow {
  title: string;
  userInstruction: string;
  steps: readonly FlowStep[];
}

export interface SavedFlowSummary {
  title: string;
  description: string;
  slug: string;
  filePath: string;
  modifiedAtMs: number;
  savedTargetScope: TestTarget["scope"];
  savedTargetDisplayName: string;
}

export interface SavedFlowFileData {
  formatVersion: number;
  title: string;
  description: string;
  slug: string;
  savedTargetScope: TestTarget["scope"];
  savedTargetDisplayName: string;
  selectedCommit?: CommitSummary;
  flow: SavedFlow;
  environment: BrowserEnvironmentHints;
}

export interface ExecuteBrowserFlowOptions {
  target: TestTarget;
  userInstruction: string;
  environment?: BrowserEnvironmentHints;
  savedFlow?: SavedFlow;
  provider?: AgentProvider;
  providerSettings?: AgentProviderSettings;
  model?: LanguageModelV3;
  browserMcpServerName?: string;
  liveViewUrl?: string;
}
