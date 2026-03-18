import { Option, Schema } from "effect";

export interface ChangedFile {
  path: string;
  status: "A" | "M" | "D" | "R" | "C" | "?";
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
}

const PLANNER_CHANGED_FILE_LIMIT = 12;
const PLANNER_MAX_STEP_COUNT = 8;
const STEP_ID_PAD_LENGTH = 2;

export class FileStat extends Schema.Class<FileStat>("@ami/FileStat")({
  relativePath: Schema.String,
  added: Schema.Number,
  removed: Schema.Number,
}) {}

export class GitState extends Schema.Class<GitState>("@supervisor/GitState")({
  isGitRepo: Schema.Boolean,
  currentBranch: Schema.String,
  mainBranch: Schema.UndefinedOr(Schema.String),
  isOnMain: Schema.Boolean,
  hasChangesFromMain: Schema.Boolean,
  hasUnstagedChanges: Schema.Boolean,
  hasBranchCommits: Schema.Boolean,
  branchCommitCount: Schema.Number,
  fileStats: Schema.Array(FileStat),
}) {}

export const StepId = Schema.String.pipe(Schema.brand("StepId"));
export type StepId = typeof StepId.Type;

export const PlanId = Schema.String.pipe(Schema.brand("PlanId"));
export type PlanId = typeof PlanId.Type;

export const ChangesFor = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("WorkingTree") }),
  Schema.Struct({ _tag: Schema.Literal("Branch"), branchName: Schema.String, base: Schema.String }),
  Schema.Struct({ _tag: Schema.Literal("Commit"), hash: Schema.String }),
]);
export type ChangesFor = typeof ChangesFor.Type;

export const GhPrListItem = Schema.Struct({
  number: Schema.Number,
  headRefName: Schema.String,
  author: Schema.Struct({ login: Schema.String }),
  state: Schema.String,
  updatedAt: Schema.String,
});

export class RemoteBranch extends Schema.Class<RemoteBranch>("@supervisor/RemoteBranch")({
  name: Schema.String,
  author: Schema.String,
  prNumber: Schema.NullOr(Schema.Number),
  prStatus: Schema.NullOr(Schema.Literals(["open", "draft", "merged"] as const)),
  updatedAt: Schema.NullOr(Schema.String),
}) {}

export class FileDiff extends Schema.Class<FileDiff>("@supervisor/FileDiff")({
  relativePath: Schema.String,
  diff: Schema.String,
}) {}

export class TestPlanStep extends Schema.Class<TestPlanStep>("@supervisor/TestPlanStep")({
  id: StepId,
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.Option(Schema.String),
}) {}

export class TestPlanDraft extends Schema.Class<TestPlanDraft>("@supervisor/TestPlanDraft")({
  changesFor: ChangesFor,
  currentBranch: Schema.String,
  diffPreview: Schema.String,
  fileStats: Schema.Array(FileStat),
  instruction: Schema.String,
  baseUrl: Schema.Option(Schema.String),
  isHeadless: Schema.Boolean,
  requiresCookies: Schema.Boolean,
}) {
  get prompt(): string {
    const scopeDescription =
      this.changesFor._tag === "WorkingTree"
        ? "working tree (unstaged/staged changes)"
        : this.changesFor._tag === "Branch"
          ? `branch diff (${this.changesFor.base}..${this.changesFor.branchName})`
          : `commit ${this.changesFor.hash}`;

    const fileStatsText =
      this.fileStats.length > 0
        ? this.fileStats
            .slice(0, PLANNER_CHANGED_FILE_LIMIT)
            .map((stat) => `  ${stat.relativePath} (+${stat.added} -${stat.removed})`)
            .join("\n")
        : "  (no changed files)";

    const diffsText = this.diffPreview || "(no diffs available)";

    return [
      "You are planning a browser-based regression test for a developer.",
      "Return JSON only — no prose before or after the JSON object.",
      "",
      "Testing context:",
      `- Scope: ${scopeDescription}`,
      `- Current branch: ${this.currentBranch}`,
      `- User instruction: ${this.instruction}`,
      "",
      `Changed files (${this.fileStats.length}):`,
      fileStatsText,
      "",
      "Diffs:",
      diffsText,
      "",
      "Environment:",
      `- Base URL: ${Option.isSome(this.baseUrl) ? this.baseUrl.value : "not provided"}`,
      `- Headless: ${this.isHeadless ? "yes" : "no"}`,
      `- Requires cookies: ${this.requiresCookies ? "yes" : "no"}`,
      "",
      "Requirements:",
      "- Blend the user instruction with the code changes to plan realistic browser test steps.",
      "- Each step must be executable and verifiable by a browser agent.",
      "- Use expectedOutcome as a concrete browser assertion target, not a vague goal.",
      `- Maximum ${PLANNER_MAX_STEP_COUNT} steps.`,
      `- Pad step IDs to ${STEP_ID_PAD_LENGTH} digits (e.g. step-01, step-02).`,
      "",
      "Return a JSON object with this exact shape:",
      '{"id":"string","title":"string","rationale":"string","steps":[{"id":"string","title":"string","instruction":"string","expectedOutcome":"string","routeHint":"string|null"}]}',
    ].join("\n");
  }
}

export class TestPlan extends TestPlanDraft.extend<TestPlan>("@supervisor/TestPlan")({
  id: PlanId,
  title: Schema.String,
  rationale: Schema.String,
  steps: Schema.Array(TestPlanStep),
}) {
  get prompt(): string {
    return [
      "You are executing an approved browser test plan.",
      'You have browser tools via the MCP server named "browser":',
      "",
      "1. open — Launch a browser and navigate to a URL.",
      "2. playwright — Execute Playwright code in Node. Globals: page, context, browser, ref(id).",
      "3. screenshot — Capture page state. Use mode: 'snapshot' (ARIA tree, preferred), 'screenshot' (PNG), 'annotated' (PNG with labels).",
      "4. close — Close the browser and flush the session.",
      "",
      "Strongly prefer screenshot with mode 'snapshot' for observing page state.",
      "Only use 'screenshot' or 'annotated' for purely visual assertions.",
      "",
      "Before and after each step, emit these exact status lines on their own lines:",
      "STEP_START|<step-id>|<step-title>",
      "STEP_DONE|<step-id>|<short-summary>",
      "ASSERTION_FAILED|<step-id>|<why-it-failed>",
      "RUN_COMPLETED|passed|<final-summary>",
      "RUN_COMPLETED|failed|<final-summary>",
      "",
      "Before emitting RUN_COMPLETED, call the close tool exactly once.",
      "",
      "Environment:",
      `- Base URL: ${Option.isSome(this.baseUrl) ? this.baseUrl.value : "not provided"}`,
      `- Headed mode: ${this.isHeadless ? "headless" : "headed"}`,
      `- Reuse browser cookies: ${this.requiresCookies ? "yes" : "no"}`,
      "",
      "Approved plan:",
      `Title: ${this.title}`,
      `Rationale: ${this.rationale}`,
      "",
      this.steps
        .map((step) =>
          [
            `- ${step.id}: ${step.title}`,
            `  instruction: ${step.instruction}`,
            `  expected outcome: ${step.expectedOutcome}`,
            `  route hint: ${Option.isSome(step.routeHint) ? step.routeHint.value : "none"}`,
          ].join("\n"),
        )
        .join("\n"),
    ].join("\n");
  }
}

export const PlanStepJson = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.optional(Schema.NullOr(Schema.String)),
});

export const TestPlanJson = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  rationale: Schema.String,
  steps: Schema.Array(PlanStepJson),
});

export class RunStarted extends Schema.TaggedClass<RunStarted>()("RunStarted", {
  plan: TestPlan,
}) {}

export class StepStarted extends Schema.TaggedClass<StepStarted>()("StepStarted", {
  stepId: StepId,
  title: Schema.String,
}) {}

export class StepCompleted extends Schema.TaggedClass<StepCompleted>()("StepCompleted", {
  stepId: StepId,
  summary: Schema.String,
}) {}

export class StepFailed extends Schema.TaggedClass<StepFailed>()("StepFailed", {
  stepId: StepId,
  message: Schema.String,
}) {}

export class ToolCall extends Schema.TaggedClass<ToolCall>()("ToolCall", {
  toolName: Schema.String,
  input: Schema.Unknown,
}) {}

export class ToolResult extends Schema.TaggedClass<ToolResult>()("ToolResult", {
  toolName: Schema.String,
  result: Schema.String,
  isError: Schema.Boolean,
}) {}

export class AgentThinking extends Schema.TaggedClass<AgentThinking>()("AgentThinking", {
  text: Schema.String,
}) {}

export class RunFinished extends Schema.TaggedClass<RunFinished>()("RunFinished", {
  status: Schema.Literals(["passed", "failed"] as const),
  summary: Schema.String,
}) {}

export const ExecutionEvent = Schema.Union([
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
  AgentThinking,
  RunFinished,
]);
export type ExecutionEvent = typeof ExecutionEvent.Type;

export class TestReportStep extends Schema.Class<TestReportStep>("@supervisor/TestReportStep")({
  stepId: StepId,
  title: Schema.String,
  status: Schema.Literals(["passed", "failed", "not-run"] as const),
  summary: Schema.String,
}) {}

export class TestReport extends Schema.Class<TestReport>("@supervisor/TestReport")({
  steps: Schema.Array(TestReportStep),
  summary: Schema.String,
  screenshotPaths: Schema.Array(Schema.String),
  pullRequest: Schema.Option(Schema.suspend(() => PullRequest)),
}) {
  get status(): "passed" | "failed" {
    return this.steps.every((step) => step.status !== "failed") ? "passed" : "failed";
  }
}

export class RunCompleted extends Schema.TaggedClass<RunCompleted>()("RunCompleted", {
  report: TestReport,
}) {}

export const UpdateContent = Schema.Union([
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
  AgentThinking,
  RunFinished,
  RunCompleted,
]);
export type UpdateContent = typeof UpdateContent.Type;

export class Update extends Schema.Class<Update>(
  "@supervisor/Update",
)({
  content: UpdateContent,
  receivedAt: Schema.DateTimeUtc,
}) {}

export class PullRequest extends Schema.Class<PullRequest>("@supervisor/PullRequest")({
  number: Schema.Number,
  url: Schema.String,
  title: Schema.String,
  headRefName: Schema.String,
}) {}

export const FindPullRequestPayload = Schema.TaggedUnion({
  Branch: { branchName: Schema.String },
});
export type FindPullRequestPayload = typeof FindPullRequestPayload.Type;

export class ExecutedTestPlan extends TestPlan.extend<ExecutedTestPlan>(
  "@supervisor/ExecutedTestPlan",
)({
  events: Schema.Array(ExecutionEvent),
}) {
  addEvent(event: ExecutionEvent): ExecutedTestPlan {
    return new ExecutedTestPlan({ ...this, events: [...this.events, event] });
  }

  get testReport(): TestReport {
    const stepResults = new Map<string, TestReportStep>(
      this.steps.map((step) => [
        step.id,
        new TestReportStep({ stepId: step.id, title: step.title, status: "not-run", summary: "" }),
      ]),
    );

    for (const event of this.events) {
      if (event._tag === "StepCompleted") {
        const existing = stepResults.get(event.stepId);
        if (existing) {
          stepResults.set(
            event.stepId,
            new TestReportStep({ ...existing, status: "passed", summary: event.summary }),
          );
        }
      } else if (event._tag === "StepFailed") {
        const existing = stepResults.get(event.stepId);
        if (existing) {
          stepResults.set(
            event.stepId,
            new TestReportStep({ ...existing, status: "failed", summary: event.message }),
          );
        }
      }
    }

    const runFinished = this.events.findLast((event) => event._tag === "RunFinished");
    const summary = runFinished?._tag === "RunFinished" ? runFinished.summary : "Run completed.";

    const screenshotPaths = this.events
      .filter((event) => event._tag === "ToolResult" && event.toolName.endsWith("__screenshot"))
      .map((event) => (event._tag === "ToolResult" ? event.result : ""));

    return new TestReport({
      steps: [...stepResults.values()],
      summary,
      screenshotPaths,
      pullRequest: Option.none(),
    });
  }
}
