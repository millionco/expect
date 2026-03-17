import type {
  BrowserEnvironmentHints,
  BrowserFlowPlan,
  BrowserRunReport,
  PlanStep,
  TestTarget,
} from "../types.js";

export interface RunMemoryStepOutcome {
  stepId: string;
  title: string;
  status: "passed" | "failed" | "not-run";
  summary: string;
  routeHint?: string;
}

export interface RunMemoryRecord {
  id: string;
  createdAt: string;
  branch: string;
  baseUrl?: string;
  targetScope: TestTarget["scope"];
  changedFiles: string[];
  instruction: string;
  planTitle: string;
  targetUrls: string[];
  usedCookies: boolean;
  status: "passed" | "failed";
  stepOutcomes: RunMemoryStepOutcome[];
  findings: string[];
  durationMs: number;
}

export interface RouteMemory {
  route: string;
  requiresAuth: boolean;
  lastTestedAt: string;
  successCount: number;
  failureCount: number;
  commonIssues: string[];
}

export interface FlowMemory {
  instruction: string;
  planTitle: string;
  targetUrls: string[];
  lastSuccessAt?: string;
  lastFailureAt?: string;
  successCount: number;
  failureCount: number;
}

export interface FailureMemory {
  pattern: string;
  occurrenceCount: number;
  lastSeenAt: string;
  associatedRoutes: string[];
}

export interface EnvironmentFact {
  fact: string;
  confidence: number;
  evidenceCount: number;
}

export interface MemoryIndex {
  version: number;
  lastUpdatedAt: string;
  totalRuns: number;
  routes: RouteMemory[];
  flows: FlowMemory[];
  failures: FailureMemory[];
  environmentFacts: EnvironmentFact[];
}

export interface CreateRunMemoryOptions {
  target: TestTarget;
  plan: BrowserFlowPlan;
  environment?: BrowserEnvironmentHints;
  report: BrowserRunReport;
  startedAt: number;
  completedAt: number;
}

export interface PlannerMemoryContext {
  instruction: string;
}

export interface ExecutorMemoryContext {
  targetUrls: string[];
  steps: PlanStep[];
}
