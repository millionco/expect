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

  it("wraps user prompt sections in XML tags", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("<environment>");
    expect(prompt).toContain("</environment>");
    expect(prompt).toContain("<changed_files>");
    expect(prompt).toContain("<diff_preview>");
    expect(prompt).toContain("<developer_request>");
    expect(prompt).toContain("<scope_strategy>");
  });

  it("includes browser tool descriptions in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("open: launch a browser");
    expect(prompt).toContain("playwright: execute Playwright");
    expect(prompt).toContain("screenshot: capture page state");
    expect(prompt).toContain("console_logs: get browser console");
    expect(prompt).toContain("network_requests: get captured requests");
    expect(prompt).toContain("close: close the browser");
  });

  it("documents browser engine switching in open tool description", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("browser='webkit'");
    expect(prompt).toContain("browser='firefox'");
    expect(prompt).toContain("Close the current session first before switching engines");
  });

  it("includes step marker protocol in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("STEP_START|<step-id>|<step-title>");
    expect(prompt).toContain("STEP_DONE|<step-id>|<short-summary>");
    expect(prompt).toContain("ASSERTION_FAILED|<step-id>|<why-it-failed>");
    expect(prompt).toContain("RUN_COMPLETED|passed|<session-summary>");
    expect(prompt).toContain("RUN_COMPLETED|failed|<session-summary>");
  });

  it("describes session summary as a handoff to the outer agent", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("handoff to the outer agent");
    expect(prompt).toContain("what was verified");
    expect(prompt).toContain("bugs found");
    expect(prompt).toContain("anything learned");
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

  it("puts data before developer request and scope strategy at the end", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    const diffIndex = prompt.indexOf("<diff_preview>");
    const requestIndex = prompt.indexOf("<developer_request>");
    const scopeIndex = prompt.indexOf("<scope_strategy>");
    expect(diffIndex).toBeLessThan(requestIndex);
    expect(requestIndex).toBeLessThan(scopeIndex);
  });

  it("includes environment context", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).toContain("Base URL: http://localhost:3000");
    expect(prompt).toContain("Browser is headless: no");
    expect(prompt).toContain("Uses existing browser cookies: no");
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

  it("omits learnings section when not provided", () => {
    const prompt = buildExecutionPrompt(makeDefaultOptions());
    expect(prompt).not.toContain("<project_learnings>");
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

  it("includes snapshot workflow in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<snapshot_workflow>");
    expect(prompt).toContain("ref()");
    expect(prompt).toContain("Never guess CSS selectors");
  });

  it("wraps system prompt sections in XML tags", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<change_analysis>");
    expect(prompt).toContain("<coverage_rules>");
    expect(prompt).toContain("<execution_strategy>");
    expect(prompt).toContain("<ui_quality_rules>");
    expect(prompt).toContain("<tools");
    expect(prompt).toContain("<snapshot_workflow>");
    expect(prompt).toContain("<status_markers>");
    expect(prompt).toContain("<failure_reporting>");
    expect(prompt).toContain("<run_completion>");
  });

  it("places sections in correct order", () => {
    const prompt = buildExecutionSystemPrompt();
    const changeAnalysis = prompt.indexOf("<change_analysis>");
    const executionStrategy = prompt.indexOf("<execution_strategy>");
    const dataSeeding = prompt.indexOf("<data_seeding>");
    const uiQuality = prompt.indexOf("<ui_quality_rules>");
    const tools = prompt.indexOf("<tools");
    const statusMarkers = prompt.indexOf("<status_markers>");
    const runCompletion = prompt.indexOf("<run_completion>");
    expect(changeAnalysis).toBeLessThan(executionStrategy);
    expect(executionStrategy).toBeLessThan(dataSeeding);
    expect(dataSeeding).toBeLessThan(uiQuality);
    expect(uiQuality).toBeLessThan(tools);
    expect(tools).toBeLessThan(statusMarkers);
    expect(statusMarkers).toBeLessThan(runCompletion);
  });

  it("includes data seeding section with adversarial test values", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<data_seeding>");
    expect(prompt).toContain("MUST have real data");
    expect(prompt).toContain("MINIMUM 3 records");
    expect(prompt).toContain("Günther Müller-Lüdenscheid");
    expect(prompt).toContain("[Setup]");
    expect(prompt).toContain("<script>alert(1)</script>");
    expect(prompt).toContain("empty state renders correctly");
  });

  it("includes assertion depth guidance in execution strategy", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("two independent signals");
    expect(prompt).toContain("Verify absence when relevant");
  });

  it("includes change-analysis guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<change_analysis>");
    expect(prompt).toContain("Scan the provided changed files list and diff preview");
    expect(prompt).toContain("developer request is a starting point");
  });

  it("includes coverage rules in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<coverage_rules>");
    expect(prompt).toContain("test multiple consumers");
  });

  it("includes code-level testing guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<code_testing>");
    expect(prompt).toContain("no user-visible surface");
  });

  it("includes project healthcheck guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("healthcheck");
    expect(prompt).toContain("package.json");
    expect(prompt).toContain("lock files");
  });

  it("includes layered interaction guidance for dropdowns and menus", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Layered interactions");
    expect(prompt).toContain("selectOption");
  });

  it("mentions snapshotAfter in playwright tool description", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("snapshotAfter=true");
  });

  it("includes batching guidance", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Batch actions that do NOT change DOM structure");
    expect(prompt).toContain("DOM-changing");
  });

  it("includes hover-to-reveal and nested menu guidance", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Hover-to-reveal");
    expect(prompt).toContain("Nested menus");
  });

  it("includes stability and recovery guidance in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<stability_and_recovery>");
    expect(prompt).toContain("four attempts fail");
    expect(prompt).toContain("stop and report");
  });

  it("requires structured failure reports with good/bad example", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("category=<allowed-category>;");
    expect(prompt).toContain("next-agent-prompt=<one sentence");
    expect(prompt).toContain("Bad: ASSERTION_FAILED|step-03|button missing");
    expect(prompt).toContain("Good: ASSERTION_FAILED|step-03|category=app-bug");
  });

  it("includes UI quality rules section in system prompt", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("<ui_quality_rules>");
    expect(prompt).toContain("these checks are mandatory");
  });

  it("includes design system conformance rules", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Design system conformance:");
    expect(prompt).toContain("tailwind.config");
    expect(prompt).toContain("hardcoded hex/rgb colors");
  });

  it("includes responsive viewport sizes with tablet breakpoints", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Responsive design:");
    expect(prompt).toContain("375\u00d7812 (iPhone SE)");
    expect(prompt).toContain("390\u00d7844 (iPhone 14)");
    expect(prompt).toContain("768\u00d71024 (iPad Mini)");
    expect(prompt).toContain("810\u00d71080 (iPad Air)");
    expect(prompt).toContain("1024\u00d7768 (iPad landscape)");
    expect(prompt).toContain("setViewportSize");
  });

  it("includes touch interaction testing rules", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Touch interaction:");
    expect(prompt).toContain("also complete via tap");
  });

  it("includes cross-browser Safari/WebKit check", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Cross-browser (Safari/WebKit):");
    expect(prompt).toContain("flexbox gap");
    expect(prompt).toContain("WebKit is unavailable");
  });

  it("includes dark mode verification rules", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Dark mode:");
    expect(prompt).toContain("prefers-color-scheme");
    expect(prompt).toContain("dark mode");
  });

  it("includes layout stability (CLS) rules", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Layout stability (CLS):");
    expect(prompt).toContain("layout shift");
    expect(prompt).toContain("0.1");
  });

  it("includes font loading verification rules", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain("Font loading:");
    expect(prompt).toContain("document.fonts");
    expect(prompt).toContain("@font-face");
    expect(prompt).toContain("system stack");
  });

  it("includes self-check before RUN_COMPLETED", () => {
    const prompt = buildExecutionSystemPrompt();
    expect(prompt).toContain(
      "Review the changed files list and confirm every file is accounted for",
    );
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
    expect(prompt).not.toContain("Changed files:");
  });

  it("handles empty diff", () => {
    const prompt = buildWatchAssessmentPrompt(makeWatchOptions({ diffPreview: "" }));
    expect(prompt).not.toContain("Diff preview:");
  });
});
