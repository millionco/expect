import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";
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
  BrowserRunArtifacts,
  BrowserRunFinding,
  BrowserRunReport,
  BrowserRunStepResult,
  TestTarget,
} from "./types";

interface CreateBrowserRunReportOptions {
  target: TestTarget;
  userInstruction: string;
  events: BrowserRunEvent[];
  completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }>;
  replaySessionPath?: string;
  screenshotPaths: string[];
  onProgress?: (message: string) => Promise<void> | void;
}

interface ArtifactPreparationResult {
  artifacts: BrowserRunArtifacts;
}

const getStepResults = (
  events: BrowserRunEvent[],
  completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }>,
): BrowserRunStepResult[] => {
  const stepResultById = new Map<string, BrowserRunStepResult>();
  const stepOrder: string[] = [];

  const ensureStepResult = (stepId: string, title: string): BrowserRunStepResult => {
    const existingStepResult = stepResultById.get(stepId);
    if (existingStepResult) {
      if (existingStepResult.title !== title) {
        stepResultById.set(stepId, { ...existingStepResult, title });
      }
      return stepResultById.get(stepId)!;
    }

    const stepResult = {
      stepId,
      title,
      status: "not-run" as const,
      summary: "Step was not completed.",
    };
    stepResultById.set(stepId, stepResult);
    stepOrder.push(stepId);
    return stepResult;
  };

  for (const event of events) {
    if (event.type === "step-started") {
      ensureStepResult(event.stepId, event.title);
    }

    if (event.type === "step-completed") {
      const stepResult = ensureStepResult(event.stepId, event.stepId);
      stepResultById.set(event.stepId, {
        ...stepResult,
        status: "passed",
        summary: event.summary,
      });
    }

    if (event.type === "assertion-failed") {
      const stepResult = ensureStepResult(event.stepId, event.stepId);
      stepResultById.set(event.stepId, {
        ...stepResult,
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

  return stepOrder
    .map((stepId) => stepResultById.get(stepId))
    .filter((stepResult): stepResult is BrowserRunStepResult => Boolean(stepResult));
};

const getFindings = (
  events: BrowserRunEvent[],
  completionEvent: Extract<BrowserRunEvent, { type: "run-completed" }>,
): BrowserRunFinding[] => {
  const findings: BrowserRunFinding[] = [];

  for (const event of events) {
    if (event.type !== "assertion-failed") continue;

    findings.push({
      id: `${event.stepId}-${findings.length + 1}`,
      severity: "error",
      title: `${event.stepId} failed`,
      detail: event.message,
      stepId: event.stepId,
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

const copyArtifact = (
  assetDirectoryPath: string,
  filePath: string,
  preferredPrefix: string,
): string | undefined => {
  if (!fs.existsSync(filePath)) return undefined;

  const targetPath = path.join(
    assetDirectoryPath,
    `${preferredPrefix}-${crypto.randomUUID().slice(0, 8)}${path.extname(filePath)}`,
  );
  fs.copyFileSync(filePath, targetPath);
  return `${SHARE_ASSET_DIRECTORY_NAME}/${path.basename(targetPath)}`;
};

const createShareBundle = (options: {
  report: Omit<BrowserRunReport, "artifacts">;
  artifacts: BrowserRunArtifacts;
}): Pick<BrowserRunArtifacts, "shareBundlePath" | "shareSummaryPath" | "shareUrl"> => {
  const shareOutputDirectoryPath = process.env.BROWSER_TESTER_SHARE_OUTPUT_DIR;
  const shareBaseUrl = process.env.BROWSER_TESTER_SHARE_BASE_URL;
  const bundleId = crypto.randomUUID().slice(0, 8);
  const shareBundlePath =
    shareOutputDirectoryPath && shareBaseUrl
      ? path.join(path.resolve(shareOutputDirectoryPath), bundleId)
      : fs.mkdtempSync(path.join(os.tmpdir(), SHARE_DIRECTORY_PREFIX));

  fs.mkdirSync(shareBundlePath, { recursive: true });
  const assetDirectoryPath = path.join(shareBundlePath, SHARE_ASSET_DIRECTORY_NAME);
  fs.mkdirSync(assetDirectoryPath, { recursive: true });

  const sharedScreenshotPaths = options.artifacts.screenshotPaths;
  const sharedReplayPath = options.artifacts.replaySessionPath;

  const bundledScreenshotRelativePaths = sharedScreenshotPaths
    .map((screenshotPath, index) =>
      copyArtifact(assetDirectoryPath, screenshotPath, `screenshot-${index}`),
    )
    .filter((relativePath): relativePath is string => Boolean(relativePath));

  let replayNdjsonRelativePath: string | undefined;
  if (sharedReplayPath && fs.existsSync(sharedReplayPath)) {
    replayNdjsonRelativePath = copyArtifact(assetDirectoryPath, sharedReplayPath, "replay");
  }

  const shareSummaryPath = path.join(shareBundlePath, SHARE_SUMMARY_FILE_NAME);
  const shareReportPath = path.join(shareBundlePath, SHARE_REPORT_FILE_NAME);

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

  fs.writeFileSync(shareSummaryPath, summaryLines.join("\n"), "utf-8");
  fs.writeFileSync(shareReportPath, reportHtml, "utf-8");

  return {
    shareBundlePath,
    shareSummaryPath,
    shareUrl:
      shareOutputDirectoryPath && shareBaseUrl
        ? `${shareBaseUrl.replace(/\/$/, "")}/${bundleId}/${SHARE_REPORT_FILE_NAME}`
        : url.pathToFileURL(shareReportPath).href,
  };
};

const prepareArtifacts = (
  replaySessionPath: string | undefined,
  screenshotPaths: string[],
): ArtifactPreparationResult => {
  const existingScreenshotPaths = screenshotPaths.filter((screenshotPath) =>
    fs.existsSync(screenshotPath),
  );
  const existingReplaySessionPath =
    replaySessionPath && fs.existsSync(replaySessionPath) ? replaySessionPath : undefined;

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
  const stepResults = getStepResults(options.events, options.completionEvent);
  const findings = getFindings(options.events, options.completionEvent);
  await options.onProgress?.("Looking up pull request");
  const [artifactPreparation, pullRequest] = await Promise.all([
    prepareArtifacts(options.replaySessionPath, options.screenshotPaths),
    getPullRequestForBranch(options.target.cwd, options.target.branch.current),
  ]);

  const partialReport = {
    title: options.userInstruction,
    status: options.completionEvent.status,
    summary: options.completionEvent.summary,
    findings,
    stepResults,
    warnings: [] as string[],
    pullRequest,
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
