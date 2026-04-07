import type { Browser } from "@expect/cookies";
import type {
  ChangedFile,
  ChangesFor,
  CommitSummary,
  SavedFlow,
  TestCoverageReport,
} from "./models";

const EXECUTION_CONTEXT_FILE_LIMIT = 12;
const EXECUTION_RECENT_COMMIT_LIMIT = 5;
const DIFF_PREVIEW_CHAR_LIMIT = 12_000;
const DEFAULT_BROWSER_MCP_SERVER_NAME = "browser";

export interface DevServerHint {
  readonly url: string;
  readonly projectPath: string;
  readonly devCommand: string;
}

export interface ExecutionPromptOptions {
  readonly userInstruction: string;
  readonly scope: ChangesFor["_tag"];
  readonly currentBranch: string;
  readonly mainBranch: string | undefined;
  readonly changedFiles: readonly ChangedFile[];
  readonly recentCommits: readonly CommitSummary[];
  readonly diffPreview: string;
  readonly baseUrl: string | undefined;
  readonly isHeadless: boolean;
  readonly cookieImportProfiles: readonly Browser[];
  readonly browserMcpServerName?: string;
  readonly savedFlow?: SavedFlow;
  readonly learnings?: string;
  readonly testCoverage?: TestCoverageReport;
  readonly devServerHints?: readonly DevServerHint[];
}

const formatSavedFlowGuidance = (savedFlow: SavedFlow | undefined): string[] => {
  if (!savedFlow) return [];

  return [
    "Saved flow guidance:",
    "You are replaying a previously saved flow. Follow these steps as guidance, but adapt if the UI has changed.",
    `Saved flow title: ${savedFlow.title}`,
    `Saved flow request: ${savedFlow.userInstruction}`,
    "",
    ...savedFlow.steps.flatMap((step, index) => [
      `Step ${index + 1}: ${step.title}`,
      `Instruction: ${step.instruction}`,
      `Expected: ${step.expectedOutcome}`,
      "",
    ]),
  ];
};

const getScopeStrategy = (scope: ChangesFor["_tag"]): string[] => {
  switch (scope) {
    case "Commit":
      return [
        "- Start narrow and prove the selected commit's intended change works first.",
        "- Treat the selected commit and its touched files as the primary testing hypothesis.",
        "- After the primary flow, test 2-4 adjacent flows that could regress from the same change. Think about what else touches the same components, routes, or data.",
        "- For UI changes, verify related views that render the same data or share the same components.",
      ];
    case "WorkingTree":
      return [
        "- Start with the exact user-requested flow against the local in-progress changes.",
        "- After the primary flow, test related flows that exercise the same code paths — aim for 2-3 follow-ups.",
        "- Pay extra attention to partially-implemented features: check that incomplete states don't break existing behavior.",
      ];
    case "Changes":
      return [
        "- Treat committed and uncommitted work as one body of change.",
        "- Cover the requested flow first, then the highest-risk adjacent flows.",
        "- Test 2-4 follow-up flows, prioritizing paths that share components or data with the changed files.",
        "- If the changes touch shared utilities or layouts, verify multiple pages that use them.",
      ];
    default:
      return [
        "- This is a branch-level review — be thorough. The goal is to catch regressions before merge, not to do a quick spot-check.",
        "- Cover the requested flow first, then systematically test each area affected by the changed files.",
        "- Aim for 5-8 total tested flows. Derive them from the changed files: each changed route, component, or data path should get its own verification.",
        "- Test cross-cutting concerns: if shared components, layouts, or utilities changed, verify them on multiple pages that consume them.",
        "- The per-flow edge-case rule applies — for branch reviews, prioritize security and authorization edge cases (unauthorized access, missing permissions, broken link).",
        "- Do not stop after the happy path passes. The value of a branch review is catching what the developer might have missed.",
      ];
  }
};

const formatTestCoverageSection = (testCoverage: TestCoverageReport | undefined): string[] => {
  if (!testCoverage || testCoverage.totalCount === 0) return [];

  const lines = [
    `Test coverage of changed files: ${testCoverage.percent}% (${testCoverage.coveredCount}/${testCoverage.totalCount} files have tests)`,
  ];

  const covered = testCoverage.entries.filter((entry) => entry.covered);
  const uncovered = testCoverage.entries.filter((entry) => !entry.covered);

  for (const entry of covered) {
    lines.push(`  [covered] ${entry.path} (tested by: ${entry.testFiles.slice(0, 3).join(", ")})`);
  }
  for (const entry of uncovered) {
    lines.push(`  [no test] ${entry.path}`);
  }

  if (uncovered.length > 0) {
    lines.push("Prioritize browser-testing files WITHOUT existing test coverage.");
  }

  lines.push("");
  return lines;
};

export const buildExecutionPrompt = (options: ExecutionPromptOptions): string => {
  const mcpName = options.browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;
  const changedFiles = options.changedFiles.slice(0, EXECUTION_CONTEXT_FILE_LIMIT);
  const recentCommits = options.recentCommits.slice(0, EXECUTION_RECENT_COMMIT_LIMIT);
  const rawDiff = options.diffPreview || "";
  const diffPreview =
    rawDiff.length > DIFF_PREVIEW_CHAR_LIMIT
      ? rawDiff.slice(0, DIFF_PREVIEW_CHAR_LIMIT) + "\n... (truncated)"
      : rawDiff;

  const devServerLines =
    options.devServerHints && options.devServerHints.length > 0
      ? [
          "Dev servers (not running — start before testing):",
          ...options.devServerHints.map(
            (hint) => `  cd ${hint.projectPath} && ${hint.devCommand}  →  ${hint.url}`,
          ),
        ]
      : [];

  return [
    "You are a QA engineer testing code changes in a real browser. Your job is to confirm that flows given to you by the user works as described.",
    "",
    "<burden_of_proof>",
    "Your default verdict for every step is ASSERTION_FAILED. You must collect enough concrete evidence to overturn that default. If the evidence is ambiguous or requires interpretation, the default stands — fail the step.",
    "",
    "Never speculate about developer intent to justify a pass. Phrases like 'could be by design', 'might be intentional', 'probably expected behavior' are banned. You are testing observable behavior against the test expectation. If observed behavior does not match the expectation, fail. You do not know what is intentional — you only know what was requested and what you saw.",
    "",
    "Before emitting STEP_DONE, you must write a counter-evidence review: list every suspicious observation from the step (unexpected text, layout shifts, console warnings, slow loads, missing elements, partial renders). Only after documenting all counter-evidence AND determining that none of it contradicts the pass verdict may you emit STEP_DONE. If you cannot write down at least one concrete piece of positive evidence, the step is not STEP_DONE.",
    "</burden_of_proof>",
    "",
    `<tools server="${mcpName}">`,
    "1. open: launch a browser and navigate to a URL. Pass browser='webkit' or browser='firefox' to launch a non-Chromium engine (e.g. for cross-browser testing). Close the current session first before switching engines.",
    "2. playwright: execute Playwright code. Globals: page, context, browser, ref(id). Set snapshotAfter=true to auto-snapshot after execution.",
    "3. screenshot: capture page state. Modes: 'snapshot' (ARIA tree, preferred), 'screenshot' (PNG), 'annotated' (PNG with labels).",
    "4. console_logs: get browser console messages. Filter by type ('error', 'warning', 'log').",
    "5. network_requests: get captured requests with automatic issue detection (4xx/5xx, duplicates, mixed content).",
    "6. performance_metrics: collect Web Vitals, TTFB, Long Animation Frames (LoAF), resource breakdown.",
    "7. accessibility_audit: run WCAG audit (axe-core + IBM Equal Access). Returns violations with selectors and fix guidance.",
    "8. close: close the browser and end the session.",
    "",
    "Prefer screenshot mode 'snapshot' for observing page state. Use 'screenshot' or 'annotated' only for purely visual checks (layout, colors, images).",
    "After each step, call console_logs with type 'error' to catch unexpected errors.",
    "</tools>",
    "",
    "<snapshot_workflow>",
    "1. Call screenshot mode='snapshot' to get the ARIA tree with refs like [ref=e4].",
    "2. Use ref() in playwright to act on elements: await ref('e3').fill('test@example.com'); await ref('e4').click();",
    "3. Take a new snapshot only when the page structure changes (navigation, modal, new content).",
    "Always snapshot first, then use ref() to act. Never guess CSS selectors.",
    "",
    "Batch actions that do NOT change DOM structure into a single playwright call. Do NOT batch across DOM-changing boundaries (dropdown open, modal, dialog). After a DOM-changing action, take a new snapshot for fresh refs.",
    "",
    "Layered interactions (dropdowns, menus, popovers): click trigger, wait briefly, take a NEW snapshot, then click the revealed option. For native <select> elements, use ref('eN').selectOption('value') directly.",
    "Hover-to-reveal: use ref('eN').hover() as the trigger. Nested menus: repeat the trigger-snapshot-select cycle per level.",
    "",
    "Scroll-aware snapshots: snapshots only show elements visible in scroll containers. Hidden items appear as '- note \"N items hidden above/below\"'. To reveal hidden content, scroll using playwright: await page.evaluate(() => document.querySelector('[aria-label=\"List\"]').scrollTop += 500). Then take a new snapshot. Use fullPage=true in screenshot to include all elements.",
    "</snapshot_workflow>",
    "",
    "<status_markers>",
    "Emit these exact status markers on their own lines during execution. The test run fails without them.",
    "",
    "Before starting each step, emit: STEP_START|<step-id>|<step-title>",
    "After completing each step, emit one of:",
    "  STEP_DONE|<step-id>|<short-summary>",
    "  ASSERTION_FAILED|<step-id>|<why-it-failed>",
    "  STEP_SKIPPED|<step-id>|<reason-it-was-skipped>",
    "After all steps are done, emit exactly one of:",
    "  RUN_COMPLETED|passed|<final-summary>",
    "  RUN_COMPLETED|failed|<final-summary>",
    "",
    "Every test run must have at least one STEP_START/STEP_DONE pair and must end with RUN_COMPLETED. Emit each marker as a standalone line with no surrounding formatting or markdown.",
    "Use STEP_SKIPPED when a step cannot be executed due to missing prerequisites (e.g. test credentials not available, auth-blocked). Never use STEP_DONE for steps that were not actually tested.",
    "",
    "Before emitting STEP_DONE you must:",
    "  1. State the positive evidence (URL, text content, snapshot ref, console output, measurement) that proves the step passed.",
    "  2. List all counter-evidence: every suspicious observation from the step (unexpected text, layout shifts, console warnings, slow loads, missing elements, partial renders, wrong values).",
    "  3. Explain why the counter-evidence does not contradict the pass verdict. If you cannot, emit ASSERTION_FAILED instead.",
    "A step without this review is not a STEP_DONE — it is a skip. You literally cannot emit STEP_DONE without first writing down everything suspicious you saw.",
    "Report outcomes faithfully. If a check fails, emit ASSERTION_FAILED with evidence. Never emit STEP_DONE for a step that showed failures, and never skip a mandatory check without emitting STEP_SKIPPED. The outer agent may re-execute your steps — if a STEP_DONE has no supporting evidence, the run is rejected.",
    "</status_markers>",
    "",
    "<failure_reporting>",
    "Allowed failure categories: app-bug, env-issue, auth-blocked, missing-test-data, selector-drift, agent-misread.",
    "Allowed failure domains (use the most specific match): design-system, responsive, touch, cross-browser, dark-mode, layout-stability, font-loading, accessibility, performance, animation, seo, security, general.",
    "",
    "When a step fails, gather structured evidence before emitting ASSERTION_FAILED:",
    "- Call screenshot mode='snapshot' to capture the ARIA tree.",
    "- Use playwright to gather diagnostics: current URL, page title, and the first 500 characters of body text.",
    "- Use a single-line bug report format inside <why-it-failed>: category=<allowed-category>; domain=<allowed-domain>; expected=<expected behavior>; actual=<what happened>; url=<current url>; evidence=<key text, console error, network failure, or DOM/snapshot observation>; repro=<short reproduction sequence>; likely-scope=<changed file, component, route, or unknown>; next-agent-prompt=<one sentence the user can paste into an agent to investigate or fix it>.",
    "- Prefer concrete values over placeholders. Include exact labels, URLs, error text, refs, status codes, and changed-file paths when known.",
    "",
    "Bad: ASSERTION_FAILED|step-03|button missing",
    "Good: ASSERTION_FAILED|step-03|category=app-bug; domain=responsive; expected=Submit button visible at 375px; actual=button clipped by overflow:hidden on .form-container; url=<current-page-url>; evidence=snapshot ref=e4 width=0; repro=resize to 375×812, open /login; likely-scope=src/components/LoginForm.tsx; next-agent-prompt=Fix overflow clipping on .form-container at mobile viewports",
    "</failure_reporting>",
    "",
    "<run_completion>",
    "Before emitting RUN_COMPLETED, complete all of these steps:",
    "1. Call accessibility_audit to check for WCAG violations. Report critical or serious violations as ASSERTION_FAILED steps.",
    "2. Call performance_metrics to collect the performance trace. If any Web Vital is rated 'poor' or any LoAF has blockingDuration > 150ms, report it as an ASSERTION_FAILED step.",
    "3. Run the project healthcheck: read package.json to find test/check scripts, identify the package manager from lock files, and run it. Report pass/fail as a step.",
    "4. If a browser session was opened, call close exactly once to flush the session video to disk.",
    "5. Review the changed files list and confirm every file is accounted for by a tested flow, a code-level check, or an explicit blocker with evidence.",
    "Do not emit RUN_COMPLETED until all steps above are done.",
    "</run_completion>",
    "",
    "<environment>",
    ...(options.baseUrl ? [`Base URL: ${options.baseUrl}`] : []),
    ...devServerLines,
    `Browser is headless: ${options.isHeadless ? "yes" : "no"}`,
    `Uses existing browser cookies: ${options.cookieImportProfiles.length > 0 ? `yes (${options.cookieImportProfiles.map((profile) => profile._tag).join(", ")})` : "no"}`,
    `Scope: ${options.scope}`,
    `Current branch: ${options.currentBranch}`,
    ...(options.mainBranch ? [`Main branch: ${options.mainBranch}`] : []),
    "</environment>",
    "",
    ...(changedFiles.length > 0
      ? [
          "<changed_files>",
          changedFiles.map((file) => `- [${file.status}] ${file.path}`).join("\n"),
          "</changed_files>",
          "",
        ]
      : []),
    ...formatTestCoverageSection(options.testCoverage),
    ...(recentCommits.length > 0
      ? [
          "<recent_commits>",
          recentCommits.map((commit) => `${commit.shortHash} ${commit.subject}`).join("\n"),
          "</recent_commits>",
          "",
        ]
      : []),
    ...(diffPreview ? ["<diff_preview>", diffPreview, "</diff_preview>", ""] : []),
    ...formatSavedFlowGuidance(options.savedFlow),
    ...(options.learnings?.trim()
      ? ["<project_learnings>", options.learnings.trim(), "</project_learnings>", ""]
      : []),
    "<developer_request>",
    options.userInstruction,
    "</developer_request>",
    "",
  ].join("\n");
};

export interface WatchAssessmentPromptOptions {
  readonly diffPreview: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly instruction: string;
}

export const buildWatchAssessmentPrompt = (options: WatchAssessmentPromptOptions): string =>
  [
    "You are a code-change classifier for a browser testing tool.",
    "",
    "Given a git diff and a list of changed files, decide whether browser tests should run.",
    "",
    "Respond with EXACTLY one line:",
    "  run — changes affect user-visible behavior (UI, routes, API calls, styles, copy, config that changes runtime behavior)",
    "  skip — changes are purely internal with no user-visible effect (comments, type-only refactors, test files only, documentation, lock files, .gitignore, CI config)",
    "",
    "Rules:",
    "- If in doubt, respond with run.",
    "- Do NOT explain your reasoning. Output only the single word: run or skip.",
    "",
    "User's test instruction:",
    options.instruction,
    "",
    ...(options.changedFiles.length > 0
      ? [
          "Changed files:",
          options.changedFiles.map((file) => `- [${file.status}] ${file.path}`).join("\n"),
          "",
        ]
      : []),
    ...(options.diffPreview ? ["Diff preview:", options.diffPreview] : []),
  ].join("\n");
