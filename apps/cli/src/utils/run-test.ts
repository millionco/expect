import type { BrowserRunEvent } from "@browser-tester/orchestrator";
import { VERSION } from "../constants.js";
import { fetchCommits } from "./fetch-commits.js";
import { getGitState, getRecommendedScope } from "./get-git-state.js";
import { executeApprovedPlan, generateBrowserPlan, type TestAction } from "./browser-agent.js";

const ACTION_LABELS: Record<TestAction, string> = {
  "test-unstaged": "unstaged changes",
  "test-branch": "branch",
  "select-commit": "commit",
};

const DEFAULT_INSTRUCTIONS: Record<TestAction, string> = {
  "test-unstaged": "Test all unstaged changes in the browser and verify they work correctly.",
  "test-branch": "Test all branch changes in the browser and verify they work correctly.",
  "select-commit":
    "Test the selected commit's changes in the browser and verify they work correctly.",
};

const formatRunEvent = (event: BrowserRunEvent): string | null => {
  switch (event.type) {
    case "run-started":
      return `Starting ${event.planTitle}`;
    case "step-started":
      return `→ ${event.stepId} ${event.title}`;
    case "step-completed":
      return `  ✓ ${event.stepId} ${event.summary}`;
    case "assertion-failed":
      return `  ✗ ${event.stepId} ${event.message}`;
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

const formatErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const runTest = async (action: TestAction, commitHash?: string): Promise<void> => {
  const gitState = getGitState();

  let commit;
  if (action === "select-commit") {
    if (commitHash) {
      const commits = fetchCommits();
      commit = commits.find(
        (candidate) => candidate.shortHash === commitHash || candidate.hash.startsWith(commitHash),
      );
      if (!commit) {
        console.error(`Commit "${commitHash}" not found in recent history.`);
        process.exit(1);
      }
    }
  }

  console.error(`testie v${VERSION}`);
  console.error(`Testing ${ACTION_LABELS[action]} on ${gitState.currentBranch}\n`);

  try {
    console.error("Planning browser flow...");
    const { target, plan, environment } = await generateBrowserPlan({
      action,
      commit,
      userInstruction: DEFAULT_INSTRUCTIONS[action],
    });

    console.error(`Plan: ${plan.title} (${plan.steps.length} steps)\n`);

    for await (const event of executeApprovedPlan({ target, plan, environment })) {
      const line = formatRunEvent(event);
      if (line) {
        process.stdout.write(line + "\n");
      }
    }
  } catch (error) {
    console.error(`Error: ${formatErrorMessage(error)}`);
    process.exit(1);
  }
};

export const autoDetectAndTest = async (): Promise<void> => {
  const gitState = getGitState();
  const scope = getRecommendedScope(gitState);
  const action: TestAction = scope === "unstaged-changes" ? "test-unstaged" : "test-branch";
  await runTest(action);
};
