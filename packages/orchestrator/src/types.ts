import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { AgentProviderSettings } from "@browser-tester/agent";

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

export interface TestTargetSelection {
  action: "test-unstaged" | "test-branch" | "select-commit";
  commitHash?: string;
  commitShortHash?: string;
  commitSubject?: string;
}

export interface TestTarget {
  scope: "unstaged" | "branch" | "commit";
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

export interface BrowserEnvironmentHints {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}

export interface PlanBrowserFlowOptions {
  target: TestTarget;
  userInstruction: string;
  environment?: BrowserEnvironmentHints;
  providerSettings?: AgentProviderSettings;
  model?: LanguageModelV3;
}

export interface ExecuteBrowserFlowOptions {
  target: TestTarget;
  plan: BrowserFlowPlan;
  environment?: BrowserEnvironmentHints;
  providerSettings?: AgentProviderSettings;
  model?: LanguageModelV3;
  browserMcpServerName?: string;
  videoOutputPath?: string;
  signal?: AbortSignal;
}

export interface BrowserRunBaseEvent {
  timestamp: number;
}

export interface BrowserRunStartedEvent extends BrowserRunBaseEvent {
  type: "run-started";
  planTitle: string;
}

export interface BrowserRunTextEvent extends BrowserRunBaseEvent {
  type: "text";
  text: string;
}

export interface BrowserRunThinkingEvent extends BrowserRunBaseEvent {
  type: "thinking";
  text: string;
}

export interface BrowserRunToolCallEvent extends BrowserRunBaseEvent {
  type: "tool-call";
  toolName: string;
  input: string;
}

export interface BrowserRunToolResultEvent extends BrowserRunBaseEvent {
  type: "tool-result";
  toolName: string;
  result: string;
  isError: boolean;
}

export interface BrowserRunBrowserLogEvent extends BrowserRunBaseEvent {
  type: "browser-log";
  action: string;
  message: string;
}

export interface BrowserRunStepStartedEvent extends BrowserRunBaseEvent {
  type: "step-started";
  stepId: string;
  title: string;
}

export interface BrowserRunStepCompletedEvent extends BrowserRunBaseEvent {
  type: "step-completed";
  stepId: string;
  summary: string;
}

export interface BrowserRunAssertionFailedEvent extends BrowserRunBaseEvent {
  type: "assertion-failed";
  stepId: string;
  message: string;
}

export interface BrowserRunCompletedEvent extends BrowserRunBaseEvent {
  type: "run-completed";
  status: "passed" | "failed";
  summary: string;
  sessionId?: string;
  videoPath?: string;
}

export interface BrowserRunErrorEvent extends BrowserRunBaseEvent {
  type: "error";
  message: string;
}

export type BrowserRunEvent =
  | BrowserRunStartedEvent
  | BrowserRunTextEvent
  | BrowserRunThinkingEvent
  | BrowserRunToolCallEvent
  | BrowserRunToolResultEvent
  | BrowserRunBrowserLogEvent
  | BrowserRunStepStartedEvent
  | BrowserRunStepCompletedEvent
  | BrowserRunAssertionFailedEvent
  | BrowserRunCompletedEvent
  | BrowserRunErrorEvent;

export interface ExecutionStreamState {
  bufferedText: string;
  sessionId?: string;
}

export interface ExecutionStreamContext {
  browserMcpServerName: string;
  stepsById: Map<string, PlanStep>;
}

export interface ExecutionStreamParseResult {
  events: BrowserRunEvent[];
  nextState: ExecutionStreamState;
}
