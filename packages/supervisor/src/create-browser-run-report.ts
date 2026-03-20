import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildReplayViewerHtml } from "@browser-tester/browser";
import {
  SHARE_ASSET_DIRECTORY_NAME,
  SHARE_DIRECTORY_PREFIX,
  SHARE_REPORT_FILE_NAME,
  SHARE_SUMMARY_FILE_NAME,
} from "./constants";
import type { BrowserRunEvent } from "./events";
import { getPullRequestForBranch } from "./github-comment";
import type {
  BrowserFlowPlan,
  BrowserRunArtifacts,
  BrowserRunFinding,
  BrowserRunReport,
  BrowserRunStepResult,
  TestTarget,
} from "./types";

interface CreateBrowserRunReportOptions {
  target: TestTarget;
  plan: BrowserFlowPlan;
  events: BrowserRunEvent[];
  completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }>;
  replaySessionPath?: string;
  screenshotPaths: string[];
  onProgress?: (message: string) => Promise<void> | void;
}

interface ArtifactPreparationResult {
  artifacts: BrowserRunArtifacts;
}

const normalizeText = (value: string): string => value.trim().toLowerCase();

const matchesRiskArea = (riskArea: string, texts: string[]): boolean => {
  const normalizedRiskArea = normalizeText(riskArea);
  return texts.some((text) => normalizeText(text).includes(normalizedRiskArea));
};

const getStepResults = (
  plan: BrowserFlowPlan,
  events: BrowserRunEvent[],
  completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }>,
): BrowserRunStepResult[] => {
  const stepResultById = new Map<string, BrowserRunStepResult>();

  for (const step of plan.steps) {
    stepResultById.set(step.id, {
      stepId: step.id,
      title: step.title,
      status: "not-run",
      summary: "Step was not completed.",
    });
  }

  for (const event of events) {
    if (event.type === "step-completed") {
      const existingStepResult = stepResultById.get(event.stepId);
      if (!existingStepResult) continue;
      stepResultById.set(event.stepId, {
        ...existingStepResult,
        status: "passed",
        summary: event.summary,
      });
    }

    if (event.type === "assertion-failed") {
      const existingStepResult = stepResultById.get(event.stepId);
      if (!existingStepResult) continue;
      stepResultById.set(event.stepId, {
        ...existingStepResult,
        status: "failed",
        summary: event.message,
      });
    }
  }

  // HACK: direct runs don't emit per-step events, so infer step status from the overall run result
  for (const stepResult of stepResultById.values()) {
    if (stepResult.status === "not-run") {
      stepResult.status = completionEvent.status === "passed" ? "passed" : "failed";
      stepResult.summary = completionEvent.summary;
    }
  }

  return plan.steps
    .map((step) => stepResultById.get(step.id))
    .filter((stepResult): stepResult is BrowserRunStepResult => Boolean(stepResult));
};

const getFindings = (
  events: BrowserRunEvent[],
  plan: BrowserFlowPlan,
  completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }>,
): BrowserRunFinding[] => {
  const findings: BrowserRunFinding[] = [];

  for (const event of events) {
    if (event.type !== "assertion-failed") continue;

    const planStep = plan.steps.find((step) => step.id === event.stepId);
    findings.push({
      id: `${event.stepId}-${findings.length + 1}`,
      severity: "error",
      title: planStep ? `${planStep.title} failed` : `${event.stepId} failed`,
      detail: event.message,
      stepId: event.stepId,
      stepTitle: planStep?.title,
    });
  }

  if (completionEvent.status === "failed" && findings.length === 0) {
    findings.push({
      id: "run-failed",
      severity: "warning",
      title: "Run completed with unresolved issues",
      detail: completionEvent.summary,
    });
  }

  return findings;
};

const getRiskAreaSummary = (
  plan: BrowserFlowPlan,
  stepResults: BrowserRunStepResult[],
  findings: BrowserRunFinding[],
): Pick<BrowserRunReport, "confirmedRiskAreas" | "clearedRiskAreas" | "unresolvedRiskAreas"> => {
  const confirmedRiskAreas: string[] = [];
  const clearedRiskAreas: string[] = [];
  const unresolvedRiskAreas: string[] = [];

  const failedTexts = stepResults
    .filter((stepResult) => stepResult.status === "failed")
    .flatMap((stepResult) => [stepResult.title, stepResult.summary]);
  const findingTexts = findings.flatMap((finding) => [finding.title, finding.detail]);
  const passedTexts = stepResults
    .filter((stepResult) => stepResult.status === "passed")
    .flatMap((stepResult) => [stepResult.title, stepResult.summary]);

  for (const riskArea of plan.riskAreas) {
    if (matchesRiskArea(riskArea, [...failedTexts, ...findingTexts])) {
      confirmedRiskAreas.push(riskArea);
      continue;
    }

    if (matchesRiskArea(riskArea, passedTexts)) {
      clearedRiskAreas.push(riskArea);
      continue;
    }

    unresolvedRiskAreas.push(riskArea);
  }

  return {
    confirmedRiskAreas,
    clearedRiskAreas,
    unresolvedRiskAreas,
  };
};

const copyArtifact = (
  assetDirectoryPath: string,
  filePath: string,
  preferredPrefix: string,
): string | undefined => {
  if (!existsSync(filePath)) return undefined;

  const targetPath = join(
    assetDirectoryPath,
    `${preferredPrefix}-${randomUUID().slice(0, 8)}${extname(filePath)}`,
  );
  copyFileSync(filePath, targetPath);
  return `${SHARE_ASSET_DIRECTORY_NAME}/${basename(targetPath)}`;
};

const createShareBundle = (options: {
  report: Omit<BrowserRunReport, "artifacts">;
  artifacts: BrowserRunArtifacts;
}): Pick<BrowserRunArtifacts, "shareBundlePath" | "shareSummaryPath" | "shareUrl"> => {
  const shareOutputDirectoryPath = process.env.BROWSER_TESTER_SHARE_OUTPUT_DIR;
  const shareBaseUrl = process.env.BROWSER_TESTER_SHARE_BASE_URL;
  const bundleId = randomUUID().slice(0, 8);
  const shareBundlePath =
    shareOutputDirectoryPath && shareBaseUrl
      ? join(resolve(shareOutputDirectoryPath), bundleId)
      : mkdtempSync(join(tmpdir(), SHARE_DIRECTORY_PREFIX));

  mkdirSync(shareBundlePath, { recursive: true });
  const assetDirectoryPath = join(shareBundlePath, SHARE_ASSET_DIRECTORY_NAME);
  mkdirSync(assetDirectoryPath, { recursive: true });

  const sharedScreenshotPaths = options.artifacts.screenshotPaths;
  const sharedReplayPath = options.artifacts.replaySessionPath;

  const bundledScreenshotRelativePaths = sharedScreenshotPaths
    .map((screenshotPath, index) =>
      copyArtifact(assetDirectoryPath, screenshotPath, `screenshot-${index}`),
    )
    .filter((relativePath): relativePath is string => Boolean(relativePath));

  let replayNdjsonRelativePath: string | undefined;
  if (sharedReplayPath && existsSync(sharedReplayPath)) {
    replayNdjsonRelativePath = copyArtifact(assetDirectoryPath, sharedReplayPath, "replay");
  }

  const shareSummaryPath = join(shareBundlePath, SHARE_SUMMARY_FILE_NAME);
  const shareReportPath = join(shareBundlePath, SHARE_REPORT_FILE_NAME);

  const summaryLines = [
    `# ${options.report.title}`,
    "",
    `Status: ${options.report.status}`,
    "",
    options.report.summary,
    "",
    "## Findings",
    ...(options.report.findings.length > 0
      ? options.report.findings.map((finding) => `- ${finding.title}: ${finding.detail}`)
      : ["- No blocking findings detected."]),
  ];

  const bodyHtmlParts = [
    `<h1>${options.report.title}</h1>`,
    `<p><strong>Status:</strong> ${options.report.status}</p>`,
    `<p>${options.report.summary}</p>`,
    "<h2>Findings</h2>",
    options.report.findings.length > 0
      ? `<ul>${options.report.findings
          .map((finding) => `<li><strong>${finding.title}</strong>: ${finding.detail}</li>`)
          .join("")}</ul>`
      : "<p>No blocking findings detected.</p>",
    "<h2>Steps</h2>",
    `<ul>${options.report.stepResults
      .map(
        (stepResult) =>
          `<li><strong>${stepResult.status.toUpperCase()}</strong> ${stepResult.title}: ${stepResult.summary}</li>`,
      )
      .join("")}</ul>`,
  ];

  if (bundledScreenshotRelativePaths.length > 0) {
    bodyHtmlParts.push(
      "<h2>Screenshots</h2>",
      bundledScreenshotRelativePaths
        .map(
          (relativePath) =>
            `<img src="${relativePath}" style="display: block; max-width: 100%; margin-bottom: 16px;" />`,
        )
        .join(""),
    );
  }

  const reportHtml = buildReplayViewerHtml({
    title: options.report.title,
    bodyHtml: bodyHtmlParts.join(""),
    eventsSource: replayNdjsonRelativePath ? { ndjsonPath: replayNdjsonRelativePath } : undefined,
  });

  writeFileSync(shareSummaryPath, summaryLines.join("\n"), "utf-8");
  writeFileSync(shareReportPath, reportHtml, "utf-8");

  return {
    shareBundlePath,
    shareSummaryPath,
    shareUrl:
      shareOutputDirectoryPath && shareBaseUrl
        ? `${shareBaseUrl.replace(/\/$/, "")}/${bundleId}/${SHARE_REPORT_FILE_NAME}`
        : pathToFileURL(shareReportPath).href,
  };
};

const prepareArtifacts = (
  replaySessionPath: string | undefined,
  screenshotPaths: string[],
): ArtifactPreparationResult => {
  const existingScreenshotPaths = screenshotPaths.filter((screenshotPath) =>
    existsSync(screenshotPath),
  );
  const existingReplaySessionPath =
    replaySessionPath && existsSync(replaySessionPath) ? replaySessionPath : undefined;

  return {
    artifacts: {
      replaySessionPath: existingReplaySessionPath,
      screenshotPaths: existingScreenshotPaths,
    },
  };
};

export const createBrowserRunReport = async (
  options: CreateBrowserRunReportOptions,
): Promise<BrowserRunReport> => {
  await options.onProgress?.("Analyzing results");
  const stepResults = getStepResults(options.plan, options.events, options.completionEvent);
  const findings = getFindings(options.events, options.plan, options.completionEvent);
  const riskAreaSummary = getRiskAreaSummary(options.plan, stepResults, findings);
  await options.onProgress?.("Looking up pull request");
  const [artifactPreparation, pullRequest] = await Promise.all([
    prepareArtifacts(options.replaySessionPath, options.screenshotPaths),
    getPullRequestForBranch(options.target.cwd, options.target.branch.current),
  ]);

  const partialReport = {
    title: options.plan.title,
    status: options.completionEvent.status,
    summary: options.completionEvent.summary,
    findings,
    stepResults,
    warnings: [] as string[],
    pullRequest,
    ...riskAreaSummary,
  };

  await options.onProgress?.("Building report");
  return {
    ...partialReport,
    artifacts: {
      ...artifactPreparation.artifacts,
      ...createShareBundle({
        report: partialReport,
        artifacts: artifactPreparation.artifacts,
      }),
    },
  };
};
