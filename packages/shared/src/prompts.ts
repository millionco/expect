import { Match, Option } from "effect";
import type { ChangesFor, FileStat, TestPlanStep } from "./models.js";

const PLANNER_CHANGED_FILE_LIMIT = 12;
const PLANNER_MAX_STEP_COUNT = 8;
const STEP_ID_PAD_LENGTH = 2;
const DIFF_PREVIEW_CHAR_LIMIT = 12_000;

interface PlanningPromptOptions {
  readonly changesFor: ChangesFor;
  readonly currentBranch: string;
  readonly instruction: string;
  readonly fileStats: readonly FileStat[];
  readonly diffPreview: string;
  readonly baseUrl: Option.Option<string>;
  readonly isHeadless: boolean;
  readonly requiresCookies: boolean;
  readonly testPlanJsonSchema: string;
}

export const getPlanningPrompt = (options: PlanningPromptOptions) => {
  const scopeDescription = Match.value(options.changesFor).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "working tree (unstaged/staged changes)",
      Branch: ({ mainBranch }) => `branch diff (${mainBranch}..${options.currentBranch})`,
      Changes: ({ mainBranch }) => `changes (${mainBranch}..${options.currentBranch})`,
      Commit: ({ hash }) => `commit ${hash}`,
    }),
  );

  const fileStatsText =
    options.fileStats.length > 0
      ? options.fileStats
          .slice(0, PLANNER_CHANGED_FILE_LIMIT)
          .map((stat) => `  ${stat.relativePath} (+${stat.added} -${stat.removed})`)
          .join("\n")
      : "  (no changed files)";

  const rawDiff = options.diffPreview || "(no diffs available)";
  const diffsText =
    rawDiff.length > DIFF_PREVIEW_CHAR_LIMIT
      ? rawDiff.slice(0, DIFF_PREVIEW_CHAR_LIMIT) + "\n... (truncated)"
      : rawDiff;

  return `You are planning a browser-based regression test for a developer.

Testing context:
- Scope: ${scopeDescription}
- Current branch: ${options.currentBranch}
- User instruction: ${options.instruction}

Changed files (${options.fileStats.length}):
${fileStatsText}

Diffs:
${diffsText}

Environment:
- Base URL: ${Option.isSome(options.baseUrl) ? options.baseUrl.value : "not provided"}
- Headless: ${options.isHeadless ? "yes" : "no"}

Requirements:
- Blend the user instruction with the code changes to plan realistic browser test steps.
- Each step must be executable and verifiable by a browser agent.
- Use expectedOutcome as a concrete browser assertion target, not a vague goal.
- Maximum ${PLANNER_MAX_STEP_COUNT} steps.
- Pad step IDs to ${STEP_ID_PAD_LENGTH} digits (e.g. step-01, step-02).
- Set requiresCookies to true if the test requires an authenticated session or logged-in state.

Once you have planned the steps, WRITE the plan as a JSON file.
The JSON file path will be provided at the end of this prompt.
You MUST follow this exact JSON schema:

${options.testPlanJsonSchema}`;
};

interface ExecutionPromptOptions {
  readonly title: string;
  readonly rationale: string;
  readonly steps: readonly TestPlanStep[];
  readonly baseUrl: Option.Option<string>;
  readonly isHeadless: boolean;
  readonly requiresCookies: boolean;
}

export const getExecutionPrompt = (options: ExecutionPromptOptions) => {
  const stepsText = options.steps
    .map(
      (step) =>
        `- ${step.id}: ${step.title}
  instruction: ${step.instruction}
  expected outcome: ${step.expectedOutcome}
  route hint: ${Option.isSome(step.routeHint) ? step.routeHint.value : "none"}`,
    )
    .join("\n");

  return `You are executing an approved browser test plan.
You have browser tools via the MCP server named "browser":

1. open — Launch a browser and navigate to a URL.
2. playwright — Execute Playwright code in Node. Globals: page, context, browser, ref(id).
3. screenshot — Capture page state. Use mode: 'snapshot' (ARIA tree, preferred), 'screenshot' (PNG), 'annotated' (PNG with labels).
4. console_logs — Get browser console messages. Filter by type ('error', 'warning', 'log'). Use after navigation or interactions to catch errors.
5. network_requests — Get captured network requests. Filter by method, URL substring, or resource type ('xhr', 'fetch', 'document').
6. close — Close the browser and flush the session.

Strongly prefer screenshot with mode 'snapshot' for observing page state.
Only use 'screenshot' or 'annotated' for purely visual assertions.
After each step, check console_logs with type 'error' to catch unexpected errors.

Before and after each step, emit these exact status lines on their own lines:
STEP_START|<step-id>|<step-title>
STEP_DONE|<step-id>|<short-summary>
ASSERTION_FAILED|<step-id>|<why-it-failed>
RUN_COMPLETED|passed|<final-summary>
RUN_COMPLETED|failed|<final-summary>

Before emitting RUN_COMPLETED, call the close tool exactly once.

Environment:
- Base URL: ${Option.isSome(options.baseUrl) ? options.baseUrl.value : "not provided"}
- Headed mode: ${options.isHeadless ? "headless" : "headed"}
- Reuse browser cookies: ${options.requiresCookies ? "yes" : "no"}

Approved plan:
Title: ${options.title}
Rationale: ${options.rationale}

${stepsText}`;
};
