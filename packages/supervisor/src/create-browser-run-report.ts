import * as child_process from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";
import * as util from "node:util";
import {
  HIGHLIGHT_OVERLAY_FONT_SIZE_PX,
  HIGHLIGHT_OVERLAY_HEIGHT_PX,
  HIGHLIGHT_OVERLAY_OPACITY,
  HIGHLIGHT_OVERLAY_PADDING_X_PX,
  HIGHLIGHT_VIDEO_FILE_NAME,
  HIGHLIGHT_WINDOW_LEADING_MS,
  HIGHLIGHT_WINDOW_MERGE_GAP_MS,
  HIGHLIGHT_WINDOW_MIN_DURATION_MS,
  HIGHLIGHT_WINDOW_TRAILING_MS,
  MIN_RUN_DURATION_MS,
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
  rawVideoPath?: string;
  screenshotPaths: string[];
  onProgress?: (message: string) => Promise<void> | void;
}

interface TimeWindow {
  startMs: number;
  endMs: number;
  title?: string;
}

interface ArtifactPreparationResult {
  artifacts: BrowserRunArtifacts;
  warnings: string[];
}

const execFileAsync = util.promisify(child_process.execFile);

const commandExists = async (command: string): Promise<boolean> => {
  try {
    await execFileAsync("which", [command], { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
};

const ffmpegFilterAvailable = async (filterName: string): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-hide_banner", "-filters"], {
      encoding: "utf-8",
    });
    return stdout.includes(filterName);
  } catch {
    return false;
  }
};

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
      const existingStepResult = ensureStepResult(event.stepId, event.stepId);
      stepResultById.set(event.stepId, {
        ...existingStepResult,
        status: "passed",
        summary: event.summary,
      });
    }

    if (event.type === "assertion-failed") {
      const existingStepResult = ensureStepResult(event.stepId, event.stepId);
      stepResultById.set(event.stepId, {
        ...existingStepResult,
        status: "failed",
        summary: event.message,
      });
    }
  }

  if (stepOrder.length === 0) {
    return [
      {
        stepId: "step-01",
        title: "Run requested browser test",
        status: completionEvent.status,
        summary: completionEvent.summary,
      },
    ];
  }

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
  const stepTitleById = new Map<string, string>();

  for (const event of events) {
    if (event.type === "step-started") {
      stepTitleById.set(event.stepId, event.title);
    }
  }

  for (const event of events) {
    if (event.type !== "assertion-failed") continue;

    const stepTitle = stepTitleById.get(event.stepId);
    findings.push({
      id: `${event.stepId}-${findings.length + 1}`,
      severity: "error",
      title: stepTitle ? `${stepTitle} failed` : `${event.stepId} failed`,
      detail: event.message,
      stepId: event.stepId,
      stepTitle,
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

const isInterestingToolName = (toolName: string): boolean => {
  const ignoredSuffixes = ["__close"];
  return !ignoredSuffixes.some((suffix) => toolName.endsWith(suffix));
};

export const escapeFilterText = (text: string): string => text.replaceAll("'", "''");

export const buildStepTitleOverlayFilter = (title: string): string => {
  const escapedTitle = escapeFilterText(title);
  return [
    `drawbox=x=0:y=0:w=iw:h=${HIGHLIGHT_OVERLAY_HEIGHT_PX}:color=black@${HIGHLIGHT_OVERLAY_OPACITY}:t=fill`,
    `drawtext=text='${escapedTitle}':fontsize=${HIGHLIGHT_OVERLAY_FONT_SIZE_PX}:fontcolor=white:x=${HIGHLIGHT_OVERLAY_PADDING_X_PX}:y=(${HIGHLIGHT_OVERLAY_HEIGHT_PX}-text_h)/2`,
  ].join(",");
};

export const getHighlightWindows = (events: BrowserRunEvent[]): TimeWindow[] => {
  const runStartedAt =
    events.find((event) => event.type === "run-started")?.timestamp ?? Date.now();
  const lastTimestamp = events.at(-1)?.timestamp ?? runStartedAt + MIN_RUN_DURATION_MS;
  const runDurationMs = Math.max(lastTimestamp - runStartedAt, MIN_RUN_DURATION_MS);

  let currentStepTitle: string | undefined;
  const interestingMoments: Array<{ timestampMs: number; title?: string }> = [];

  for (const event of events) {
    if (event.type === "step-started") {
      currentStepTitle = event.title;
    }

    const isInteresting =
      event.type === "step-started" ||
      event.type === "step-completed" ||
      event.type === "assertion-failed" ||
      (event.type === "tool-call" && isInterestingToolName(event.toolName));

    if (isInteresting) {
      interestingMoments.push({
        timestampMs: Math.max(0, event.timestamp - runStartedAt),
        title: currentStepTitle,
      });
    }
  }

  if (interestingMoments.length === 0) {
    return [{ startMs: 0, endMs: runDurationMs }];
  }

  const windows = interestingMoments
    .map((moment) => ({
      startMs: Math.max(0, moment.timestampMs - HIGHLIGHT_WINDOW_LEADING_MS),
      endMs: Math.min(
        runDurationMs,
        Math.max(
          moment.timestampMs + HIGHLIGHT_WINDOW_TRAILING_MS,
          moment.timestampMs + HIGHLIGHT_WINDOW_MIN_DURATION_MS,
        ),
      ),
      title: moment.title,
    }))
    .sort((leftWindow, rightWindow) => leftWindow.startMs - rightWindow.startMs);

  const mergedWindows: TimeWindow[] = [];
  for (const window of windows) {
    const previousWindow = mergedWindows.at(-1);
    if (previousWindow && window.startMs <= previousWindow.endMs + HIGHLIGHT_WINDOW_MERGE_GAP_MS) {
      previousWindow.endMs = Math.max(previousWindow.endMs, window.endMs);
      previousWindow.title ??= window.title;
      continue;
    }
    mergedWindows.push(window);
  }

  return mergedWindows;
};

const createHighlightVideo = async (
  rawVideoPath: string | undefined,
  events: BrowserRunEvent[],
  onProgress?: (message: string) => Promise<void> | void,
) => {
  if (!rawVideoPath || !fs.existsSync(rawVideoPath)) {
    return { highlightVideoPath: undefined, warning: undefined };
  }

  await onProgress?.("Generating highlight video");

  if (!(await commandExists("ffmpeg"))) {
    return {
      highlightVideoPath: undefined,
      warning: "Highlight reel skipped because ffmpeg is not installed.",
    };
  }

  const windows = getHighlightWindows(events);
  if (windows.length === 0) {
    return { highlightVideoPath: undefined, warning: undefined };
  }

  const canDrawText = await ffmpegFilterAvailable("drawtext");
  const temporaryDirectoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "browser-tester-highlight-"),
  );
  const highlightVideoPath = path.join(
    path.dirname(path.resolve(rawVideoPath)),
    HIGHLIGHT_VIDEO_FILE_NAME,
  );

  try {
    const segmentPaths: string[] = [];

    for (const [index, window] of windows.entries()) {
      const segmentPath = path.join(temporaryDirectoryPath, `segment-${index}.webm`);
      const ffmpegArguments = [
        "-y",
        "-ss",
        String(window.startMs / 1000),
        "-to",
        String(window.endMs / 1000),
        "-i",
        rawVideoPath,
      ];

      if (window.title && canDrawText) {
        ffmpegArguments.push("-vf", buildStepTitleOverlayFilter(window.title));
      }

      ffmpegArguments.push("-c:v", "libvpx-vp9", "-c:a", "libopus", segmentPath);
      await execFileAsync("ffmpeg", ffmpegArguments);
      segmentPaths.push(segmentPath);
    }

    const concatFilePath = path.join(temporaryDirectoryPath, "segments.txt");
    fs.writeFileSync(
      concatFilePath,
      segmentPaths
        .map((segmentPath) => `file '${segmentPath.replaceAll("'", "'\\''")}'`)
        .join("\n"),
      "utf-8",
    );

    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFilePath,
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "libopus",
      highlightVideoPath,
    ]);

    return { highlightVideoPath, warning: undefined };
  } catch {
    return {
      highlightVideoPath: undefined,
      warning: "Highlight reel generation failed.",
    };
  } finally {
    fs.rmSync(temporaryDirectoryPath, { recursive: true, force: true });
  }
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

  const sharedVideoPath = options.artifacts.highlightVideoPath ?? options.artifacts.rawVideoPath;
  const sharedScreenshotPaths = options.artifacts.screenshotPaths;

  const bundledVideoRelativePath = sharedVideoPath
    ? copyArtifact(assetDirectoryPath, sharedVideoPath, "video")
    : undefined;
  const bundledScreenshotRelativePaths = sharedScreenshotPaths
    .map((screenshotPath, index) =>
      copyArtifact(assetDirectoryPath, screenshotPath, `screenshot-${index}`),
    )
    .filter((relativePath): relativePath is string => Boolean(relativePath));

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

  const htmlSections = [
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

  if (bundledVideoRelativePath) {
    htmlSections.push(
      "<h2>Video</h2>",
      `<video controls style="max-width: 100%;" src="${bundledVideoRelativePath}"></video>`,
    );
  }

  if (bundledScreenshotRelativePaths.length > 0) {
    htmlSections.push(
      "<h2>Screenshots</h2>",
      bundledScreenshotRelativePaths
        .map(
          (relativePath) =>
            `<img src="${relativePath}" style="display: block; max-width: 100%; margin-bottom: 16px;" />`,
        )
        .join(""),
    );
  }

  fs.writeFileSync(shareSummaryPath, summaryLines.join("\n"), "utf-8");
  fs.writeFileSync(
    shareReportPath,
    [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<meta charset="utf-8" />',
      `<title>${options.report.title}</title>`,
      "<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:960px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0}h1,h2{color:#f8fafc}a{color:#93c5fd}</style>",
      "</head>",
      "<body>",
      ...htmlSections,
      "</body>",
      "</html>",
    ].join(""),
    "utf-8",
  );

  return {
    shareBundlePath,
    shareSummaryPath,
    shareUrl:
      shareOutputDirectoryPath && shareBaseUrl
        ? `${shareBaseUrl.replace(/\/$/, "")}/${bundleId}/${SHARE_REPORT_FILE_NAME}`
        : url.pathToFileURL(shareReportPath).href,
  };
};

const prepareArtifacts = async (
  rawVideoPath: string | undefined,
  screenshotPaths: string[],
  events: BrowserRunEvent[],
  onProgress?: (message: string) => Promise<void> | void,
): Promise<ArtifactPreparationResult> => {
  const warnings: string[] = [];
  const existingScreenshotPaths = screenshotPaths.filter((screenshotPath) =>
    fs.existsSync(screenshotPath),
  );
  const existingRawVideoPath =
    rawVideoPath && fs.existsSync(rawVideoPath) ? rawVideoPath : undefined;
  const highlightVideoResult = await createHighlightVideo(existingRawVideoPath, events, onProgress);
  if (highlightVideoResult.warning) warnings.push(highlightVideoResult.warning);

  return {
    warnings,
    artifacts: {
      rawVideoPath: existingRawVideoPath,
      highlightVideoPath: highlightVideoResult.highlightVideoPath,
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
    prepareArtifacts(
      options.rawVideoPath,
      options.screenshotPaths,
      options.events,
      options.onProgress,
    ),
    getPullRequestForBranch(options.target.cwd, options.target.branch.current),
  ]);

  const partialReport = {
    title: options.userInstruction,
    status: options.completionEvent.status,
    summary: options.completionEvent.summary,
    findings,
    stepResults,
    warnings: artifactPreparation.warnings,
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
