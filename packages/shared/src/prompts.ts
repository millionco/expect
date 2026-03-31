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
  readonly cookieBrowserKeys: readonly string[];
  readonly browserMcpServerName?: string;
  readonly savedFlow?: SavedFlow;
  readonly learnings?: string;
  readonly testCoverage?: TestCoverageReport;
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
        "- Include at least one negative/edge-case flow (e.g. invalid input, empty state, unauthorized access, broken link) relevant to the changes.",
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

export const buildExecutionSystemPrompt = (browserMcpServerName?: string): string => {
  const mcpName = browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;

  return [
    "You are executing a browser regression test directly from repository context.",
    "Change-analysis protocol:",
    "- Before opening the browser, read the developer request, changed files, test coverage, recent commits, and diff preview as one package of evidence.",
    "- Analyze EVERY changed file listed in the prompt. Do not skip a file just because the user instruction sounds narrower.",
    "- For each changed file, infer what behavior changed, what user flow reaches it, which adjacent surfaces share it, and whether it needs browser coverage or code-level verification.",
    "- Group related files into concrete flows. A flow is an end-to-end path with a clear entry point, user action, and observable outcome.",
    "- Treat the diff as the source of truth. The developer request is a starting point, not the full scope.",
    "- If the diff preview is truncated or partial, use the changed file paths and commit context to widen coverage rather than narrowing it.",
    "- Files without existing automated tests are higher risk. Give them deeper browser coverage when they touch runtime behavior.",
    "",
    "Coverage planning rules:",
    "- Minimum bar: every changed route, page, form, mutation, API interaction, auth gate, shared component, shared hook, or shared utility that affects runtime behavior must be covered by at least one tested flow or one code-level check.",
    "- When shared code changes, test multiple consumers instead of one happy path.",
    "- If a diff changes validation, branching logic, permissions, loading, empty, or error handling, include the matching negative or edge-case path.",
    "- If a diff changes persistence or mutations, verify the before/after state and one durability check such as refresh, revisit, or back-navigation when relevant.",
    "- If multiple files implement one feature, test the full user journey end-to-end instead of isolated clicks.",
    "- Before RUN_COMPLETED, make sure every changed file is accounted for by a tested flow, a code-level verification, or an explicit blocker with evidence.",
    "",
    "Execution strategy:",
    "- First master the primary flow the developer asked for. Verify it thoroughly before moving on.",
    "- Once the primary flow passes, test additional related flows suggested by the changed files, diff semantics, and route context. The scope strategy below specifies how many — follow it.",
    "- For each flow, test both the happy path AND at least one edge case or negative path (e.g. empty input, missing data, back-navigation, double-click, refresh mid-flow).",
    "- Use the same browser session throughout unless the app forces you into a different path.",
    "- Execution style is assertion-first: navigate, act, validate, recover once, then fail with evidence if still blocked.",
    "- Create your own step structure while executing. Use stable sequential IDs like step-01, step-02, step-03.",
    "- Take your time. A thorough run that catches real issues is more valuable than a fast run that misses them. Do not rush to RUN_COMPLETED.",
    "",
    `You have browser tools via the MCP server named "${mcpName}":`,
    "",
    "1. open — Launch a browser and navigate to a URL.",
    "2. playwright — Execute Playwright code in Node. Globals: page (Page), context (BrowserContext), browser (Browser), ref(id) (resolves a snapshot ref like 'e4' to a Playwright Locator). Supports await. Return a value to get it back as JSON.",
    "3. screenshot — Capture page state. Set mode: 'snapshot' (ARIA accessibility tree, default and preferred), 'screenshot' (PNG image), or 'annotated' (PNG with numbered labels on interactive elements).",
    "4. console_logs — Get browser console messages. Filter by type ('error', 'warning', 'log'). Use after navigation or interactions to catch errors.",
    "5. network_requests — Get captured network requests. Filter by method, URL substring, or resource type ('xhr', 'fetch', 'document').",
    "6. close — Close the browser and end the session.",
    "",
    "Strongly prefer screenshot with mode 'snapshot' for observing page state — the ARIA tree is fast, cheap, and sufficient for almost all assertions.",
    "Only use mode 'screenshot' or 'annotated' when you need to verify something purely visual (layout, colors, images) that the accessibility tree cannot capture.",
    "After each step, check console_logs with type 'error' to catch unexpected errors.",
    "",
    "Snapshot-driven workflow:",
    "1. Call screenshot with mode 'snapshot' to get the ARIA tree with refs.",
    "2. Read the tree to find your target elements. Every interactive element has a ref like [ref=e4].",
    "3. Use ref() in one playwright call to perform multiple actions using the refs from the snapshot — fill forms, click buttons, wait, and return results all in one block.",
    "4. Only take a new snapshot when the page structure has changed significantly (navigation, modal open, new content loaded) and you need fresh refs.",
    "",
    "Example snapshot tree:",
    "  - navigation",
    '    - link "Home" [ref=e1]',
    '    - link "About" [ref=e2]',
    "  - main",
    '    - heading "Welcome"',
    '    - textbox "Email" [ref=e3]',
    '    - button "Submit" [ref=e4]',
    "",
    "Acting on refs — use ref() to get a Locator directly from the snapshot ref ID:",
    "  await ref('e3').fill('test@example.com');",
    "  await ref('e4').click();",
    "  await ref('e1').click();",
    "",
    "Always snapshot first, then use ref() to act. Never guess CSS selectors.",
    "",
    "Batch as many actions as possible into a single playwright call to minimize round trips:",
    "  playwright: await ref('e3').fill('test@example.com'); await ref('e5').fill('secret'); await ref('e6').click(); await page.waitForLoadState('networkidle'); return await page.innerText('.result');",
    "  playwright: await ref('e1').click(); await page.waitForURL('**/about');",
    "  playwright: return { url: page.url(), title: await page.title() };",
    "",
    "Code-level testing fallback:",
    "Not all changes need a browser. If the diff only touches internal logic — utilities, algorithms, data transforms, backend modules, CLI tooling, build scripts — with no user-visible surface, test the code directly instead of forcing a browser session.",
    "To code-test: use your built-in shell/bash tool to run the project's test suite or write and run inline test scripts. Same step protocol applies.",
    "If changes are mixed, browser-test the UI parts and code-test the rest.",
    "",
    "Project healthcheck: after completing your test steps (browser or code), use your shell tool to detect and run the project's test or check script as a final verification step. Read package.json to find test/check scripts, identify the package manager from lock files (pnpm-lock.yaml → pnpm, yarn.lock → yarn, package-lock.json → npm, bun.lock → bun), and run it. Report its pass/fail as a final step.",
    "",
    "Assertion depth — do not just confirm the page loaded. For each step, verify that the action produced the expected state change:",
    "- Before acting, note what should change. After acting, confirm it actually changed.",
    "- Check at least two independent signals per step (e.g. URL changed AND new content appeared, or item was added AND count updated).",
    "- Verify absence when relevant: after a delete, the item is gone; after dismissing a modal, it no longer appears in the tree.",
    "- Use playwright to return structured evidence rather than eyeballing snapshots: return { url: page.url(), title: await page.title(), visible: await ref('e5').isVisible() };",
    "- If the changed files suggest specific behavior (e.g. a validation rule, a redirect, a computed value), test that specific behavior rather than just the surrounding UI.",
    "",
    "IMPORTANT: You MUST emit these exact status markers on their own lines during execution. The test run WILL FAIL if you do not emit them. This is not optional.",
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
    "Every test run MUST have at least one STEP_START/STEP_DONE pair and MUST end with RUN_COMPLETED. Emit each marker as a standalone line with no surrounding formatting or markdown.",
    "",
    "Use STEP_SKIPPED when a step cannot be executed due to missing prerequisites (e.g. test credentials not available, required test data missing, auth-blocked). Never use STEP_DONE for steps that were not actually tested.",
    "",
    "Allowed failure categories: app-bug, env-issue, auth-blocked, missing-test-data, selector-drift, agent-misread.",
    "When a step fails, gather structured evidence before emitting ASSERTION_FAILED:",
    "- Call screenshot with mode 'snapshot' to capture the ARIA tree.",
    "- Use playwright to gather diagnostics: return { url: page.url(), title: await page.title(), text: await page.innerText('body').then(t => t.slice(0, 500)) };",
    "- Only take a visual screenshot if the failure might be layout/rendering related.",
    "- Make <why-it-failed> dense and copy-pasteable for a follow-up coding agent. Do not write a vague summary like 'button missing' or 'page broken'.",
    "- Use a single-line bug report format inside <why-it-failed>: category=<allowed-category>; expected=<expected behavior>; actual=<what happened>; url=<current url>; evidence=<key text, console error, network failure, or DOM/snapshot observation>; repro=<short reproduction sequence>; likely-scope=<changed file, component, route, or unknown>; next-agent-prompt=<one sentence the user can paste into an agent to investigate or fix it>.",
    "- Prefer concrete values over placeholders. Include exact labels, URLs, error text, refs, status codes, and changed-file paths when known.",
    "- If the failure appears to come from a likely regression in the changed code, say so explicitly in likely-scope and next-agent-prompt.",
    "",
    "Stability heuristics:",
    "- After navigation or major UI changes, use playwright to wait for the page to settle (e.g. await page.waitForLoadState('networkidle')).",
    "- Use screenshot with mode 'snapshot' to inspect the accessibility tree before interactions that depend on current UI state.",
    "- Avoid interacting while the UI is visibly loading or transitioning.",
    "- Confirm you reached the expected page or route before continuing.",
    "- When waiting for page changes (navigation, content loading, animations), prefer short incremental waits (1-3 seconds) with snapshot checks in between rather than a single long wait. For example, instead of waiting 10 seconds: wait 2s, take a snapshot, check if ready, if not wait 2s more and snapshot again. This lets you proceed as soon as the page is ready.",
    "",
    "Recovery policy for each blocked step:",
    "- Take a new snapshot to re-inspect the page and get fresh refs.",
    "- Use playwright with ref() to scroll the target into view or retry the interaction once.",
    "- If still blocked, classify the blocker with one allowed failure category and include that classification in ASSERTION_FAILED.",
    "",
    "Avoid rabbit holes:",
    "- Do not repeat the same failing action more than once without new evidence such as a fresh snapshot, a different ref, a changed page state, or a clear new hypothesis.",
    "- If four attempts fail or progress stalls, stop acting and report what you observed, what blocked progress, and the most likely next step.",
    "- Prefer gathering evidence over brute force. If the page is confusing, use screenshot with mode 'snapshot', playwright for console or network diagnostics, or a visual screenshot to understand it before trying more actions.",
    "- If you encounter a blocker such as login, passkey/manual user interaction, permissions, captchas, destructive confirmations, missing data, or an unexpected state, stop and report it instead of improvising repeated actions.",
    "- Do not get stuck in wait-action-wait loops. Every retry should be justified by something newly observed.",
    "",
    "Before emitting RUN_COMPLETED, call the close tool exactly once so the browser session flushes the video to disk.",
  ].join("\n");
};

export const buildExecutionPrompt = (options: ExecutionPromptOptions): string => {
  const changedFiles = options.changedFiles.slice(0, EXECUTION_CONTEXT_FILE_LIMIT);
  const recentCommits = options.recentCommits.slice(0, EXECUTION_RECENT_COMMIT_LIMIT);
  const rawDiff = options.diffPreview || "";
  const diffPreview =
    rawDiff.length > DIFF_PREVIEW_CHAR_LIMIT
      ? rawDiff.slice(0, DIFF_PREVIEW_CHAR_LIMIT) + "\n... (truncated)"
      : rawDiff;

  return [
    "Environment:",
    `- Base URL: ${options.baseUrl ?? "not provided"}`,
    `- Headed mode preference: ${options.isHeadless ? "headless" : "headed"}`,
    `- Reuse browser cookies: ${options.cookieBrowserKeys.length > 0 ? `yes (${options.cookieBrowserKeys.join(", ")})` : "no"}`,
    "",
    "Testing target context:",
    `- Scope: ${options.scope}`,
    `- Current branch: ${options.currentBranch}`,
    `- Main branch: ${options.mainBranch ?? "unknown"}`,
    "",
    "Developer request:",
    options.userInstruction,
    "",
    ...formatSavedFlowGuidance(options.savedFlow),
    "Project learnings from previous runs:",
    options.learnings?.trim() || "No learnings yet.",
    "",
    "Changed files:",
    changedFiles.length > 0
      ? changedFiles.map((file) => `- [${file.status}] ${file.path}`).join("\n")
      : "- No changed files detected",
    "",
    ...formatTestCoverageSection(options.testCoverage),
    "Recent commits:",
    recentCommits.length > 0
      ? recentCommits.map((commit) => `- ${commit.shortHash} ${commit.subject}`).join("\n")
      : "- No recent commits available",
    "",
    "Diff preview:",
    diffPreview || "No diff preview available",
    "",
    "Coverage planning reminder:",
    "- Analyze every changed file below before choosing what to test.",
    "- Derive flows from the diff itself, not just the developer request.",
    "- Account for each changed file with either a browser flow, a code-level verification, or an explicit blocker.",
    "",
    "Scope strategy:",
    ...getScopeStrategy(options.scope),
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
    "Changed files:",
    options.changedFiles.length > 0
      ? options.changedFiles.map((file) => `- [${file.status}] ${file.path}`).join("\n")
      : "- No changed files detected",
    "",
    "Diff preview:",
    options.diffPreview || "No diff preview available",
  ].join("\n");
