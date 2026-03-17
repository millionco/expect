import { randomUUID } from "node:crypto";
import type { CreateRunMemoryOptions, RunMemoryRecord, RunMemoryStepOutcome } from "./types.js";

const formatRunTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

const createRunId = (timestamp: number): string =>
  `${formatRunTimestamp(timestamp)}-${randomUUID().slice(0, 8)}`;

export const createRunMemory = (options: CreateRunMemoryOptions): RunMemoryRecord => {
  const { target, plan, environment, report, startedAt, completedAt } = options;

  const stepOutcomes: RunMemoryStepOutcome[] = report.stepResults.map((stepResult) => {
    const planStep = plan.steps.find((step) => step.id === stepResult.stepId);
    return {
      stepId: stepResult.stepId,
      title: stepResult.title,
      status: stepResult.status,
      summary: stepResult.summary,
      routeHint: planStep?.routeHint,
    };
  });

  return {
    id: createRunId(startedAt),
    createdAt: new Date(startedAt).toISOString(),
    branch: target.branch.current,
    baseUrl: environment?.baseUrl,
    targetScope: target.scope,
    changedFiles: target.changedFiles.map((file) => file.path),
    instruction: plan.userInstruction,
    planTitle: plan.title,
    targetUrls: plan.targetUrls,
    usedCookies: environment?.cookies === true,
    status: report.status,
    stepOutcomes,
    findings: report.findings.map((finding) => `${finding.title}: ${finding.detail}`),
    durationMs: completedAt - startedAt,
  };
};
