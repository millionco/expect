import { Match, Option, Predicate, Schema } from "effect";

export interface ChangedFile {
  path: string;
  status: "A" | "M" | "D" | "R" | "C" | "?";
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
}

export const AgentProvider = Schema.Literals(["claude", "codex", "cursor"] as const);
export type AgentProvider = typeof AgentProvider.Type;

export const AGENT_PROVIDER_DISPLAY_NAMES: Record<AgentProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
};
const TOOL_CALL_DISPLAY_TEXT_CHAR_LIMIT = 80;
const PLANNER_CHANGED_FILE_LIMIT = 12;
const PLANNER_MAX_STEP_COUNT = 8;
const STEP_ID_PAD_LENGTH = 2;

export class FileStat extends Schema.Class<FileStat>("@ami/FileStat")({
  relativePath: Schema.String,
  added: Schema.Number,
  removed: Schema.Number,
}) {}

export class Branch extends Schema.Class<Branch>("@ami/Branch")({
  name: Schema.String,
  fullRef: Schema.String,
  authorName: Schema.OptionFromOptionalKey(Schema.String),
  authorEmail: Schema.OptionFromOptionalKey(Schema.String),
  subject: Schema.OptionFromOptionalKey(Schema.String),
  lastCommitTimestampMs: Schema.Number,
  isMyBranch: Schema.Boolean,
}) {}

export const formatFileStats = (fileStats: readonly FileStat[]): string =>
  fileStats.map((stat) => `  ${stat.relativePath} (+${stat.added} -${stat.removed})`).join("\n");

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
}) {
  get hasUntestedChanges(): boolean {
    return this.hasChangesFromMain || this.hasUnstagedChanges;
  }

  get totalChangedLines(): number {
    return this.fileStats.reduce((sum, stat) => sum + stat.added + stat.removed, 0);
  }
}

export const StepId = Schema.String.pipe(Schema.brand("StepId"));
export type StepId = typeof StepId.Type;

export const PlanId = Schema.String.pipe(Schema.brand("PlanId"));
export type PlanId = typeof PlanId.Type;

export const ChangesFor = Schema.TaggedUnion({
  WorkingTree: {},
  Branch: { mainBranch: Schema.String },
  Changes: { mainBranch: Schema.String },
  Commit: { hash: Schema.String },
});
export type ChangesFor = typeof ChangesFor.Type;

export const changesForDisplayName = (changesFor: ChangesFor): string =>
  Match.value(changesFor).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "working tree",
      Branch: () => "branch",
      Changes: () => "changes",
      Commit: ({ hash }) => hash.slice(0, 7),
    }),
  );

export const GhPrListItem = Schema.Struct({
  number: Schema.Number,
  headRefName: Schema.String,
  author: Schema.Struct({ login: Schema.String }),
  state: Schema.String,
  updatedAt: Schema.String,
});

export type BranchFilter = "recent" | "all" | "open" | "draft" | "merged" | "no-pr";

export const BRANCH_FILTERS: readonly BranchFilter[] = [
  "recent",
  "all",
  "open",
  "draft",
  "merged",
  "no-pr",
];

export class RemoteBranch extends Schema.Class<RemoteBranch>("@supervisor/RemoteBranch")({
  name: Schema.String,
  author: Schema.String,
  prNumber: Schema.NullOr(Schema.Number),
  prStatus: Schema.NullOr(Schema.Literals(["open", "draft", "merged"] as const)),
  updatedAt: Schema.NullOr(Schema.String),
}) {
  static filterBranches(
    branches: readonly RemoteBranch[],
    filter: BranchFilter,
    searchQuery?: string,
  ): RemoteBranch[] {
    let result = branches.filter((branch) => {
      if (filter === "recent" || filter === "all") return true;
      if (filter === "no-pr") return branch.prStatus === null;
      return branch.prStatus === filter;
    });
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      result = result.filter((branch) => branch.name.toLowerCase().includes(lowercaseQuery));
    }
    if (filter === "recent") {
      result = [...result]
        .filter((branch) => branch.updatedAt !== null)
        .sort((first, second) => {
          const firstDate = new Date(first.updatedAt ?? 0).getTime();
          const secondDate = new Date(second.updatedAt ?? 0).getTime();
          return secondDate - firstDate;
        });
    }
    return result;
  }
}

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
}) {
  update(
    fields: Partial<Pick<TestPlanStep, "title" | "instruction" | "expectedOutcome">>,
  ): TestPlanStep {
    return new TestPlanStep({ ...this, ...fields });
  }
}

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
    const scopeDescription = Match.value(this.changesFor).pipe(
      Match.tagsExhaustive({
        WorkingTree: () => "working tree (unstaged/staged changes)",
        Branch: ({ mainBranch }) => `branch diff (${mainBranch}..${this.currentBranch})`,
        Changes: ({ mainBranch }) => `changes (${mainBranch}..${this.currentBranch})`,
        Commit: ({ hash }) => `commit ${hash}`,
      }),
    );

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

  update(
    fields: Partial<
      Pick<TestPlanDraft, "instruction" | "baseUrl" | "isHeadless" | "requiresCookies">
    >,
  ): TestPlanDraft {
    return new TestPlanDraft({ ...this, ...fields });
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

  update(
    fields: Partial<
      Pick<TestPlanDraft, "instruction" | "baseUrl" | "isHeadless" | "requiresCookies">
    >,
  ): TestPlan {
    return new TestPlan({ ...this, ...fields });
  }

  updateStep(stepIndex: number, updater: (step: TestPlanStep) => TestPlanStep): TestPlan {
    return new TestPlan({
      ...this,
      steps: this.steps.map((step, index) => (index === stepIndex ? updater(step) : step)),
    });
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
}) {
  get displayText(): string {
    if (Predicate.isObject(this.input) && "command" in this.input) {
      return String(this.input.command).slice(0, TOOL_CALL_DISPLAY_TEXT_CHAR_LIMIT);
    }
    return this.toolName;
  }
}

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

export class RunCompleted extends Schema.TaggedClass<RunCompleted>()("RunCompleted", {
  report: Schema.suspend((): Schema.Schema<TestReport> => TestReport),
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

export class Update extends Schema.Class<Update>("@supervisor/Update")({
  content: UpdateContent,
  receivedAt: Schema.DateTimeUtc,
}) {}

export class PullRequest extends Schema.Class<PullRequest>("@supervisor/PullRequest")({
  number: Schema.Number,
  url: Schema.String,
  title: Schema.String,
  headRefName: Schema.String,
}) {}

export const TestContext = Schema.TaggedUnion({
  WorkingTree: {},
  Branch: { branch: RemoteBranch },
  PullRequest: { branch: RemoteBranch },
  Commit: {
    hash: Schema.String,
    shortHash: Schema.String,
    subject: Schema.String,
  },
});
export type TestContext = typeof TestContext.Type;

export const testContextId = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "working-tree",
      Branch: ({ branch }) => `branch-${branch.name}`,
      PullRequest: ({ branch }) => `pr-${branch.prNumber}`,
      Commit: ({ hash }) => `commit-${hash}`,
    }),
  );

export const testContextFilterText = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "local changes",
      Branch: ({ branch }) => branch.name,
      PullRequest: ({ branch }) => `#${branch.prNumber} ${branch.name} ${branch.author}`,
      Commit: ({ shortHash, subject }) => `${shortHash} ${subject}`,
    }),
  );

export const testContextLabel = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "Local changes",
      Branch: ({ branch }) => branch.name,
      PullRequest: ({ branch }) => branch.name,
      Commit: ({ shortHash }) => shortHash,
    }),
  );

export const testContextDescription = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "working tree",
      Branch: ({ branch }) => (branch.author ? `by ${branch.author}` : ""),
      PullRequest: ({ branch }) => `#${branch.prNumber} ${branch.prStatus ?? ""}`.trim(),
      Commit: ({ subject }) => subject,
    }),
  );

export const testContextDisplayLabel = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "Local changes",
      Branch: ({ branch }) => branch.name,
      PullRequest: ({ branch }) => `#${branch.prNumber}`,
      Commit: ({ shortHash }) => shortHash,
    }),
  );

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

  get activeStepId(): StepId | undefined {
    let activeId: StepId | undefined = undefined;
    for (const event of this.events) {
      if (event._tag === "StepStarted") activeId = event.stepId;
      if (
        (event._tag === "StepCompleted" || event._tag === "StepFailed") &&
        activeId === event.stepId
      ) {
        activeId = undefined;
      }
    }
    return activeId;
  }

  get completedStepCount(): number {
    const completed = new Set<StepId>();
    for (const event of this.events) {
      if (event._tag === "StepCompleted" || event._tag === "StepFailed") {
        completed.add(event.stepId);
      }
    }
    return completed.size;
  }

  get activeStep(): TestPlanStep | undefined {
    const stepId = this.activeStepId;
    if (stepId === undefined) return undefined;
    return this.steps.find((step) => step.id === stepId);
  }

  get lastToolCallDisplayText(): string | undefined {
    const lastToolCall = this.events.findLast((event) => event._tag === "ToolCall");
    if (!lastToolCall || lastToolCall._tag !== "ToolCall") return undefined;
    return lastToolCall.displayText;
  }
}

export class TestReport extends ExecutedTestPlan.extend<TestReport>("@supervisor/TestReport")({
  summary: Schema.String,
  screenshotPaths: Schema.Array(Schema.String),
  pullRequest: Schema.Option(Schema.suspend(() => PullRequest)),
}) {
  get stepStatuses(): ReadonlyMap<
    StepId,
    { status: "passed" | "failed" | "not-run"; summary: string }
  > {
    const statuses = new Map<StepId, { status: "passed" | "failed" | "not-run"; summary: string }>(
      this.steps.map((step) => [step.id, { status: "not-run", summary: "" }]),
    );

    for (const event of this.events) {
      if (event._tag === "StepCompleted") {
        statuses.set(event.stepId, { status: "passed", summary: event.summary });
      } else if (event._tag === "StepFailed") {
        statuses.set(event.stepId, { status: "failed", summary: event.message });
      }
    }

    return statuses;
  }

  get status(): "passed" | "failed" {
    const statuses = this.stepStatuses;
    for (const { status } of statuses.values()) {
      if (status === "failed") return "failed";
    }
    return "passed";
  }

  get toPlainText(): string {
    const statuses = this.stepStatuses;
    const lines = [`Status: ${this.status}`, `Summary: ${this.summary}`];
    for (const step of this.steps) {
      const entry = statuses.get(step.id);
      const stepStatus = entry?.status ?? "not-run";
      lines.push(`${stepStatus.toUpperCase()} ${step.title}: ${entry?.summary ?? ""}`);
    }
    return lines.join("\n");
  }
}
