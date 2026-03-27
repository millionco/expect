import { describe, expect, it } from "vite-plus/test";
import {
  buildExecutionPrompt,
  buildWatchAssessmentPrompt,
  type ExecutionPromptOptions,
  type WatchAssessmentPromptOptions,
} from "../src/prompts";

const makeDefaultOptions = (
  overrides?: Partial<ExecutionPromptOptions>,
): ExecutionPromptOptions => ({
  userInstruction: "Test the login flow",
  scope: "Changes",
  currentBranch: "feat/login",
  mainBranch: "main",
  changedFiles: [
    { path: "src/auth/login.ts", status: "M" },
    { path: "src/auth/signup.ts", status: "A" },
  ],
  recentCommits: [{ hash: "abc123def456", shortHash: "abc123d", subject: "feat: add login form" }],
  diffPreview: "diff --git a/src/auth/login.ts\n+export const login = () => {}",
  baseUrl: "http://localhost:3000",
  isHeadless: false,
  requiresCookies: false,
  ...overrides,
});

const makeWatchAssessmentOptions = (
  overrides?: Partial<WatchAssessmentPromptOptions>,
): WatchAssessmentPromptOptions => ({
  userInstruction: "Test the dashboard changes",
  currentBranch: "feat/dashboard",
  mainBranch: "main",
  changedFiles: [
    { path: "src/dashboard/card.tsx", status: "M" },
    { path: "src/dashboard/use-dashboard.ts", status: "M" },
  ],
  diffPreview: "diff --git a/src/dashboard/card.tsx\n+<DashboardCard />",
  heuristicReason: "Shared web code changed: 1 component, 1 module.",
  changedFileSummary: "2 files changed (1 component, 1 module)",
  ...overrides,
});

describe("buildExecutionPrompt", () => {
  it("includes the user instruction in the prompt", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Test the login flow");
  });

  it("includes browser tool instructions", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("open — Launch a browser");
    expect(prompt).toContain("playwright — Execute Playwright");
    expect(prompt).toContain("screenshot — Capture page state");
    expect(prompt).toContain("console_logs — Get browser console messages");
    expect(prompt).toContain("network_requests — Get captured network requests");
    expect(prompt).toContain("close — Close the browser");
  });

  it("includes step marker protocol", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("STEP_START|<step-id>|<step-title>");
    expect(prompt).toContain("STEP_DONE|<step-id>|<short-summary>");
    expect(prompt).toContain("ASSERTION_FAILED|<step-id>|<why-it-failed>");
    expect(prompt).toContain("RUN_COMPLETED|passed|<final-summary>");
    expect(prompt).toContain("RUN_COMPLETED|failed|<final-summary>");
  });

  it("includes changed files", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("[M] src/auth/login.ts");
    expect(prompt).toContain("[A] src/auth/signup.ts");
  });

  it("includes recent commits", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("abc123d feat: add login form");
  });

  it("includes diff preview", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("export const login = () => {}");
  });

  it("includes environment context", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Base URL: http://localhost:3000");
    expect(prompt).toContain("Headed mode preference: headed");
    expect(prompt).toContain("Reuse browser cookies: no");
  });

  it("includes branch context", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Current branch: feat/login");
    expect(prompt).toContain("Main branch: main");
  });

  it("includes scope strategy for branch scope", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions({ scope: "Branch" }));
    expect(prompt).toContain("branch-level review");
    expect(prompt).toContain("5-8 total tested flows");
  });

  it("includes scope strategy for commit scope", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions({ scope: "Commit" }));
    expect(prompt).toContain("Start narrow and prove the selected commit");
  });

  it("includes scope strategy for working tree scope", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions({ scope: "WorkingTree" }));
    expect(prompt).toContain("local in-progress changes");
  });

  it("includes scope strategy for changes scope", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions({ scope: "Changes" }));
    expect(prompt).toContain("committed and uncommitted work as one body");
  });

  it("includes saved flow guidance when provided", () => {
    const prompt = buildExecutionPrompt(
      makeDefaultOptions({
        savedFlow: {
          title: "Login Flow",
          userInstruction: "Test login",
          steps: [
            {
              id: "step-01",
              title: "Open login page",
              instruction: "Navigate to /login",
              expectedOutcome: "Login form visible",
            },
          ],
        },
      }),
    );
    expect(prompt).toContain("Saved flow guidance:");
    expect(prompt).toContain("Saved flow title: Login Flow");
    expect(prompt).toContain("Open login page");
  });

  it("omits saved flow guidance when not provided", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).not.toContain("Saved flow guidance:");
  });

  it("includes learnings when provided", () => {
    const prompt = buildExecutionPrompt(
      makeDefaultOptions({ learnings: "Auth requires a redirect to /callback after login" }),
    );
    expect(prompt).toContain("Auth requires a redirect to /callback");
  });

  it("shows no learnings placeholder when not provided", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("No learnings yet.");
  });

  it("truncates long diff previews", () => {
    const longDiff = "x".repeat(15000);
    const prompt = buildExecutionPrompt(makeDefaultOptions({ diffPreview: longDiff }));
    expect(prompt).toContain("... (truncated)");
    expect(prompt).not.toContain("x".repeat(13000));
  });

  it("instructs agent to create steps dynamically", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Create your own step structure while executing");
    expect(prompt).toContain("step-01, step-02, step-03");
  });

  it("includes snapshot-driven workflow instructions", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Snapshot-driven workflow:");
    expect(prompt).toContain("ref()");
    expect(prompt).toContain("Never guess CSS selectors");
  });

  it("includes assertion depth guidance", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Assertion depth");
    expect(prompt).toContain("two independent signals per step");
  });

  it("includes recovery and rabbit hole guidance", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Recovery policy");
    expect(prompt).toContain("Avoid rabbit holes");
    expect(prompt).toContain("four attempts fail");
  });
});

describe("buildWatchAssessmentPrompt", () => {
  it("requires the strict RUN_TEST response format", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchAssessmentOptions());
    expect(prompt).toContain("RUN_TEST|yes|<brief reason>");
    expect(prompt).toContain("RUN_TEST|no|<brief reason>");
    expect(prompt).toContain("Return exactly one line");
  });

  it("includes heuristic context for the borderline decision", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchAssessmentOptions());
    expect(prompt).toContain("Changed file summary: 2 files changed (1 component, 1 module)");
    expect(prompt).toContain("Heuristic borderline reason: Shared web code changed");
    expect(prompt).toContain("[M] src/dashboard/card.tsx");
  });

  it("includes coverage context when provided", () => {
    const prompt = buildWatchAssessmentPrompt(
      makeWatchAssessmentOptions({
        testCoverage: {
          entries: [
            {
              path: "src/dashboard/use-dashboard.ts",
              testFiles: [],
              covered: false,
            },
          ],
          coveredCount: 0,
          totalCount: 1,
          percent: 0,
        },
      }),
    );

    expect(prompt).toContain("Test coverage of changed files: 0% (0/1 files have tests)");
    expect(prompt).toContain("[no test] src/dashboard/use-dashboard.ts");
  });
});
