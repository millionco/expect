import { Effect, Stream } from "effect";
import {
  executeBrowserFlow,
  generateBrowserPlan,
  getBrowserEnvironment,
  getCommitSummary,
  getGitState,
  getRecommendedScope,
  loadSavedFlowBySlug,
  resolveBrowserTarget,
  saveTestedFingerprint,
  type BrowserRunEvent,
  type BrowserRunReport,
  type CommitSummary,
  type GenerateBrowserPlanResult,
  type TestAction,
} from "@browser-tester/supervisor";
import figures from "figures";
import { VERSION } from "../constants";
import { CliRuntime } from "../runtime";
import type { TestRunConfig } from "./test-run-config";

const ACTION_LABELS: Record<TestAction, string> = {
  "test-unstaged": "unstaged changes",
  "test-branch": "branch",
  "test-changes": "changes",
  "select-commit": "commit",
};

const DEFAULT_INSTRUCTIONS: Record<TestAction, string> = {
  "test-unstaged": "Test all unstaged changes in the browser and verify they work correctly.",
  "test-branch": "Test all branch changes in the browser and verify they work correctly.",
  "test-changes": "Test all changes from main in the browser and verify they work correctly.",
  "select-commit":
    "Test the selected commit's changes in the browser and verify they work correctly.",
};

const formatRunEvent = (event: BrowserRunEvent): string | null => {
  switch (event.type) {
    case "run-started":
      return `Starting ${event.planTitle}`;
    case "step-started":
      return `${figures.arrowRight} ${event.stepId} ${event.title}`;
    case "step-completed":
      return `  ${figures.tick} ${event.stepId} ${event.summary}`;
    case "assertion-failed":
      return `  ${figures.cross} ${event.stepId} ${event.message}`;
    case "browser-log":
      return `    browser:${event.action} ${event.message}`;
    case "text":
      return event.text;
    case "error":
      return `Error: ${event.message}`;
    case "run-completed":
      return `Run ${event.status}: ${event.summary}`;
    default:
      return null;
  }
};

const resolvePlan = async (
  config: TestRunConfig,
  selectedCommit?: CommitSummary,
): Promise<GenerateBrowserPlanResult> => {
  const { action, environmentOverrides } = config;

  if (config.flowSlug) {
    const savedFlow = await CliRuntime.runPromise(
      loadSavedFlowBySlug(config.flowSlug).pipe(
        Effect.catchTag("FlowNotFoundError", () => Effect.succeed(null)),
      ),
    );
    if (!savedFlow) {
      console.error(`Saved flow "${config.flowSlug}" not found.`);
      process.exit(1);
    }
    const target = resolveBrowserTarget({ action, commit: selectedCommit });
    const environment = {
      ...getBrowserEnvironment(environmentOverrides),
      ...savedFlow.environment,
    };
    console.error(`Using saved flow: ${savedFlow.title} (${savedFlow.plan.steps.length} steps)\n`);
    return { target, plan: savedFlow.plan, environment };
  }

  const userInstruction = config.message ?? DEFAULT_INSTRUCTIONS[action];
  console.error("Planning browser flow...");
  const result = await Effect.runPromise(
    generateBrowserPlan({
      action,
      commit: selectedCommit,
      userInstruction,
      environmentOverrides,
      provider: config.planningProvider,
      model: config.planningModel,
    }),
  );
  console.error(`Plan: ${result.plan.title} (${result.plan.steps.length} steps)\n`);
  return result;
};

export const runTest = async (config: TestRunConfig): Promise<void> => {
  const { action } = config;
  const gitState = getGitState();

  let resolvedCommit;
  if (action === "select-commit" && config.commitHash) {
    resolvedCommit = getCommitSummary(process.cwd(), config.commitHash) ?? undefined;
    if (!resolvedCommit) {
      console.error(`Commit "${config.commitHash}" not found in recent history.`);
      process.exit(1);
    }
  }

  console.error(`testie v${VERSION}`);
  if (gitState.isGitRepo) {
    console.error(`Testing ${ACTION_LABELS[action]} on ${gitState.currentBranch}\n`);
  } else {
    console.error(`Testing ${ACTION_LABELS[action]} (no git repository detected)\n`);
  }

  try {
    const { target, plan, environment } = await resolvePlan(config, resolvedCommit);
    const latestRunReportState: { current: BrowserRunReport | null } = { current: null };

    await Effect.runPromise(
      Stream.runForEach(
        executeBrowserFlow({
          target,
          plan,
          environment,
          provider: config.executionProvider,
          ...(config.executionModel ? { providerSettings: { model: config.executionModel } } : {}),
        }),
        (event) =>
          Effect.sync(() => {
            if (event.type === "run-started" && event.liveViewUrl) {
              process.stdout.write(`Live view: ${event.liveViewUrl}\n`);
            }
            if (event.type === "run-completed" && event.report) {
              latestRunReportState.current = event.report;
            }
            const line = formatRunEvent(event);
            if (line) {
              process.stdout.write(line + "\n");
            }
          }),
      ),
    );

    const latestRunReport = latestRunReportState.current;

    if (latestRunReport?.status === "passed") {
      saveTestedFingerprint();
    }

    if (latestRunReport?.artifacts.highlightVideoPath) {
      process.stdout.write(`Highlight reel: ${latestRunReport.artifacts.highlightVideoPath}\n`);
    }
    if (latestRunReport?.artifacts.shareUrl) {
      process.stdout.write(`Report: ${latestRunReport.artifacts.shareUrl}\n`);
    }
    if (latestRunReport?.pullRequest) {
      process.stdout.write(
        `Open PR: #${latestRunReport.pullRequest.number} ${latestRunReport.pullRequest.url}\n`,
      );
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
};

export const autoDetectAndTest = async (config?: Partial<TestRunConfig>): Promise<void> => {
  const gitState = getGitState();
  if (!gitState.isGitRepo) {
    await runTest({ action: "test-unstaged", ...config });
    return;
  }
  const scope = getRecommendedScope(gitState);
  const actionByScope: Record<string, TestAction> = {
    changes: "test-changes",
    "unstaged-changes": "test-unstaged",
    "entire-branch": "test-branch",
    default: "test-changes",
  };
  const action = actionByScope[scope] ?? "test-changes";
  await runTest({ action, ...config });
};
