import { describe, expect, it } from "vite-plus/test";
import {
  buildExecutionPrompt,
  buildExecutionSystemPrompt,
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
  cookieBrowserKeys: [],
  ...overrides,
});

describe("buildExecutionPrompt", () => {
  it("includes the user instruction in the prompt", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Test the login flow");
  });

  it("includes browser tool instructions in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("open — Launch a browser");
    expect(prompt).toContain("playwright — Execute Playwright");
    expect(prompt).toContain("screenshot — Capture page state");
    expect(prompt).toContain("console_logs — Get browser console messages");
    expect(prompt).toContain("network_requests — Get captured network requests");
    expect(prompt).toContain("close — Close the browser");
  });

  it("includes step marker protocol in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
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

  it("includes coverage planning reminder", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Coverage planning reminder:");
    expect(prompt).toContain("Analyze every changed file below");
    expect(prompt).toContain("Account for each changed file");
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

  it("instructs agent to create steps dynamically in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Create your own step structure while executing");
    expect(prompt).toContain("step-01, step-02, step-03");
  });

  it("includes snapshot-driven workflow instructions in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Snapshot-driven workflow:");
    expect(prompt).toContain("ref()");
    expect(prompt).toContain("Never guess CSS selectors");
  });

  it("places tool and snapshot guidance after strategy sections", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt.indexOf("Change-analysis protocol:")).toBeLessThan(
      prompt.indexOf("You have browser tools via the MCP server named"),
    );
    expect(prompt.indexOf("Execution strategy:")).toBeLessThan(
      prompt.indexOf("Snapshot-driven workflow:"),
    );
  });

  it("includes assertion depth guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Assertion depth");
    expect(prompt).toContain("two independent signals per step");
  });

  it("includes change-analysis guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Change-analysis protocol:");
    expect(prompt).toContain("Analyze EVERY changed file listed");
    expect(prompt).toContain("developer request is a starting point");
  });

  it("includes coverage planning rules in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Coverage planning rules:");
    expect(prompt).toContain("test multiple consumers");
    expect(prompt).toContain("every changed file is accounted for");
  });

  it("includes code-level testing fallback guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Code-level testing fallback:");
    expect(prompt).toContain("built-in shell/bash tool");
    expect(prompt).toContain("no user-visible surface");
  });

  it("includes project healthcheck guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Project healthcheck:");
    expect(prompt).toContain("package.json");
    expect(prompt).toContain("pnpm-lock.yaml");
  });

  it("includes recovery and rabbit hole guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Recovery policy");
    expect(prompt).toContain("Avoid rabbit holes");
    expect(prompt).toContain("four attempts fail");
  });

  it("requires rich copy-pasteable failure reports", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("copy-pasteable for a follow-up coding agent");
    expect(prompt).toContain("category=<allowed-category>;");
    expect(prompt).toContain("next-agent-prompt=<one sentence");
  });
});

describe("buildWatchAssessmentPrompt", () => {
  const makeWatchOptions = (
    overrides?: Partial<WatchAssessmentPromptOptions>,
  ): WatchAssessmentPromptOptions => ({
    instruction: "Test the login flow",
    changedFiles: [
      { path: "src/auth/login.ts", status: "M" },
      { path: "src/auth/signup.ts", status: "A" },
    ],
    diffPreview: "diff --git a/src/auth/login.ts\n+export const login = () => {}",
    ...overrides,
  });

  it("includes the user instruction", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions());
    expect(prompt).toContain("Test the login flow");
  });

  it("includes changed files", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions());
    expect(prompt).toContain("[M] src/auth/login.ts");
    expect(prompt).toContain("[A] src/auth/signup.ts");
  });

  it("includes diff preview", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions());
    expect(prompt).toContain("export const login = () => {}");
  });

  it("instructs single-word response", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions());
    expect(prompt).toContain("run or skip");
  });

  it("handles empty changed files", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions({ changedFiles: [] }));
    expect(prompt).toContain("No changed files detected");
  });

  it("handles empty diff", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions({ diffPreview: "" }));
    expect(prompt).toContain("No diff preview available");
  });
});
