import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { DateTime, Match, Option, Predicate, Schema } from "effect";

export interface ChangedFile {
  path: string;
  status: "A" | "M" | "D" | "R" | "C" | "?";
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
}

export const AgentProvider = Schema.Literals([
  "claude",
  "codex",
  "cursor",
] as const);
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
const DIFF_PREVIEW_CHAR_LIMIT = 12_000;

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
  fileStats
    .map((stat) => `  ${stat.relativePath} (+${stat.added} -${stat.removed})`)
    .join("\n");

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
  fingerprint: Schema.UndefinedOr(Schema.String),
  savedFingerprint: Schema.UndefinedOr(Schema.String),
}) {
  get hasUntestedChanges(): boolean {
    return this.hasChangesFromMain || this.hasUnstagedChanges;
  }

  get totalChangedLines(): number {
    return this.fileStats.reduce(
      (sum, stat) => sum + stat.added + stat.removed,
      0
    );
  }

  get isCurrentStateTested(): boolean {
    if (!this.fingerprint || !this.savedFingerprint) return false;
    return this.fingerprint === this.savedFingerprint;
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
    })
  );

export const GhPrListItem = Schema.Struct({
  number: Schema.Number,
  headRefName: Schema.String,
  author: Schema.Struct({ login: Schema.String }),
  state: Schema.String,
  updatedAt: Schema.String,
});

export type BranchFilter =
  | "recent"
  | "all"
  | "open"
  | "draft"
  | "merged"
  | "no-pr";

export const BRANCH_FILTERS: readonly BranchFilter[] = [
  "recent",
  "all",
  "open",
  "draft",
  "merged",
  "no-pr",
];

export class RemoteBranch extends Schema.Class<RemoteBranch>(
  "@supervisor/RemoteBranch"
)({
  name: Schema.String,
  author: Schema.String,
  prNumber: Schema.NullOr(Schema.Number),
  prStatus: Schema.NullOr(
    Schema.Literals(["open", "draft", "merged"] as const)
  ),
  updatedAt: Schema.NullOr(Schema.String),
}) {
  static filterBranches(
    branches: readonly RemoteBranch[],
    filter: BranchFilter,
    searchQuery?: string
  ): RemoteBranch[] {
    let result = branches.filter((branch) => {
      if (filter === "recent" || filter === "all") return true;
      if (filter === "no-pr") return branch.prStatus === null;
      return branch.prStatus === filter;
    });
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      result = result.filter((branch) =>
        branch.name.toLowerCase().includes(lowercaseQuery)
      );
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

export const StepStatus = Schema.Literals([
  "pending",
  "active",
  "passed",
  "failed",
]);
export type StepStatus = typeof StepStatus.Type;

export class TestPlanStep extends Schema.Class<TestPlanStep>(
  "@supervisor/TestPlanStep"
)({
  id: StepId,
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.OptionFromNullOr(Schema.String),
  status: StepStatus,
  summary: Schema.Option(Schema.String),
  startedAt: Schema.Option(Schema.DateTimeUtc),
  endedAt: Schema.Option(Schema.DateTimeUtc),
}) {
  update(
    fields: Partial<
      Pick<
        TestPlanStep,
        | "title"
        | "instruction"
        | "expectedOutcome"
        | "status"
        | "summary"
        | "startedAt"
        | "endedAt"
      >
    >
  ): TestPlanStep {
    return new TestPlanStep({ ...this, ...fields });
  }
}

export const DraftId = Schema.String.pipe(Schema.brand("DraftId"));
export type DraftId = typeof DraftId.Type;

export class TestPlanDraft extends Schema.Class<TestPlanDraft>(
  "@supervisor/TestPlanDraft"
)({
  id: DraftId,
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
        Branch: ({ mainBranch }) =>
          `branch diff (${mainBranch}..${this.currentBranch})`,
        Changes: ({ mainBranch }) =>
          `changes (${mainBranch}..${this.currentBranch})`,
        Commit: ({ hash }) => `commit ${hash}`,
      })
    );

    const fileStatsText =
      this.fileStats.length > 0
        ? this.fileStats
            .slice(0, PLANNER_CHANGED_FILE_LIMIT)
            .map(
              (stat) =>
                `  ${stat.relativePath} (+${stat.added} -${stat.removed})`
            )
            .join("\n")
        : "  (no changed files)";

    const rawDiff = this.diffPreview || "(no diffs available)";
    const diffsText =
      rawDiff.length > DIFF_PREVIEW_CHAR_LIMIT
        ? rawDiff.slice(0, DIFF_PREVIEW_CHAR_LIMIT) + "\n... (truncated)"
        : rawDiff;

    return [
      "You are planning a browser-based regression test for a developer.",
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
      `- Base URL: ${
        Option.isSome(this.baseUrl) ? this.baseUrl.value : "not provided"
      }`,
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
      "Once you have planned the steps, WRITE the plan as a JSON file.",
      "The JSON file path will be provided at the end of this prompt.",
      "You MUST follow this exact JSON schema:",
      "",
      "{",
      '  "id": "plan-01",',
      '  "title": "Short descriptive title",',
      '  "rationale": "Why these steps were chosen",',
      '  "steps": [',
      "    {",
      '      "id": "step-01",',
      '      "title": "Short step title",',
      '      "instruction": "Detailed instruction for the browser agent",',
      '      "expectedOutcome": "Concrete assertion target",',
      '      "routeHint": "/path or null"',
      "    }",
      "  ]",
      "}",
    ].join("\n");
  }

  get planFileName(): string {
    const slug = this.instruction
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 10)
      .replace(/-$/, "");
    const shortId = this.id.slice(0, 6);
    return `plan-${slug || "draft"}-${shortId}.json`;
  }

  update(
    fields: Partial<
      Pick<
        TestPlanDraft,
        "instruction" | "baseUrl" | "isHeadless" | "requiresCookies"
      >
    >
  ): TestPlanDraft {
    return new TestPlanDraft({ ...this, ...fields });
  }
}

export class TestPlan extends TestPlanDraft.extend<TestPlan>(
  "@supervisor/TestPlan"
)({
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
      "4. console_logs — Get browser console messages. Filter by type ('error', 'warning', 'log'). Use after navigation or interactions to catch errors.",
      "5. network_requests — Get captured network requests. Filter by method, URL substring, or resource type ('xhr', 'fetch', 'document').",
      "6. close — Close the browser and flush the session.",
      "",
      "Strongly prefer screenshot with mode 'snapshot' for observing page state.",
      "Only use 'screenshot' or 'annotated' for purely visual assertions.",
      "After each step, check console_logs with type 'error' to catch unexpected errors.",
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
      `- Base URL: ${
        Option.isSome(this.baseUrl) ? this.baseUrl.value : "not provided"
      }`,
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
            `  route hint: ${
              Option.isSome(step.routeHint) ? step.routeHint.value : "none"
            }`,
          ].join("\n")
        )
        .join("\n"),
    ].join("\n");
  }

  update(
    fields: Partial<
      Pick<
        TestPlanDraft,
        "instruction" | "baseUrl" | "isHeadless" | "requiresCookies"
      >
    >
  ): TestPlan {
    return new TestPlan({ ...this, ...fields });
  }

  updateStep(
    stepIndex: number,
    updater: (step: TestPlanStep) => TestPlanStep
  ): TestPlan {
    return new TestPlan({
      ...this,
      steps: this.steps.map((step, index) =>
        index === stepIndex ? updater(step) : step
      ),
    });
  }
}

/** @todo(rasmus): REMOVE */
export const PlanStepJson = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.optional(Schema.NullOr(Schema.String)),
});

/** @todo(rasmus): REMOVE */
export const TestPlanJson = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
  rationale: Schema.String,
  steps: Schema.Array(PlanStepJson),
});

export class RunStarted extends Schema.TaggedClass<RunStarted>()("RunStarted", {
  plan: TestPlan,
}) {}

export class StepStarted extends Schema.TaggedClass<StepStarted>()(
  "StepStarted",
  {
    stepId: StepId,
    title: Schema.String,
  }
) {}

export class StepCompleted extends Schema.TaggedClass<StepCompleted>()(
  "StepCompleted",
  {
    stepId: StepId,
    summary: Schema.String,
  }
) {}

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
      return String(this.input.command).slice(
        0,
        TOOL_CALL_DISPLAY_TEXT_CHAR_LIMIT
      );
    }
    return this.toolName;
  }
}

export class ToolResult extends Schema.TaggedClass<ToolResult>()("ToolResult", {
  toolName: Schema.String,
  result: Schema.String,
  isError: Schema.Boolean,
}) {}

export class AgentThinking extends Schema.TaggedClass<AgentThinking>()(
  "AgentThinking",
  {
    text: Schema.String,
  }
) {}

export class AgentText extends Schema.TaggedClass<AgentText>()("AgentText", {
  text: Schema.String,
}) {}

export class RunFinished extends Schema.TaggedClass<RunFinished>()(
  "RunFinished",
  {
    status: Schema.Literals(["passed", "failed"] as const),
    summary: Schema.String,
  }
) {}

const serializeToolResult = (value: unknown): string => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseMarker = (line: string): ExecutionEvent | undefined => {
  const pipeIndex = line.indexOf("|");
  if (pipeIndex === -1) return undefined;

  const marker = line.slice(0, pipeIndex);
  const rest = line.slice(pipeIndex + 1);
  const secondPipeIndex = rest.indexOf("|");
  const first = secondPipeIndex === -1 ? rest : rest.slice(0, secondPipeIndex);
  const second = secondPipeIndex === -1 ? "" : rest.slice(secondPipeIndex + 1);

  if (marker === "STEP_START") {
    return new StepStarted({ stepId: StepId.makeUnsafe(first), title: second });
  }
  if (marker === "STEP_DONE") {
    return new StepCompleted({
      stepId: StepId.makeUnsafe(first),
      summary: second,
    });
  }
  if (marker === "ASSERTION_FAILED") {
    return new StepFailed({
      stepId: StepId.makeUnsafe(first),
      message: second,
    });
  }
  if (marker === "RUN_COMPLETED") {
    const status =
      first === "failed" ? ("failed" as const) : ("passed" as const);
    return new RunFinished({ status, summary: second });
  }
  return undefined;
};

export const ExecutionEvent = Schema.Union([
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
  AgentThinking,
  AgentText,
  RunFinished,
]);
export type ExecutionEvent = typeof ExecutionEvent.Type;

export class RunCompleted extends Schema.TaggedClass<RunCompleted>()(
  "RunCompleted",
  {
    report: Schema.suspend((): Schema.Schema<TestReport> => TestReport),
  }
) {}

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

export class PullRequest extends Schema.Class<PullRequest>(
  "@supervisor/PullRequest"
)({
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
    })
  );

export const testContextFilterText = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "local changes",
      Branch: ({ branch }) => branch.name,
      PullRequest: ({ branch }) =>
        `#${branch.prNumber} ${branch.name} ${branch.author}`,
      Commit: ({ shortHash, subject }) => `${shortHash} ${subject}`,
    })
  );

export const testContextLabel = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "Local changes",
      Branch: ({ branch }) => branch.name,
      PullRequest: ({ branch }) => branch.name,
      Commit: ({ shortHash }) => shortHash,
    })
  );

export const testContextDescription = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "working tree",
      Branch: ({ branch }) => (branch.author ? `by ${branch.author}` : ""),
      PullRequest: ({ branch }) =>
        `#${branch.prNumber} ${branch.prStatus ?? ""}`.trim(),
      Commit: ({ subject }) => subject,
    })
  );

export const testContextDisplayLabel = (context: TestContext): string =>
  Match.value(context).pipe(
    Match.tagsExhaustive({
      WorkingTree: () => "Local changes",
      Branch: ({ branch }) => branch.name,
      PullRequest: ({ branch }) => `#${branch.prNumber}`,
      Commit: ({ shortHash }) => shortHash,
    })
  );

export const FindPullRequestPayload = Schema.TaggedUnion({
  Branch: { branchName: Schema.String },
});
export type FindPullRequestPayload = typeof FindPullRequestPayload.Type;

export class ExecutedTestPlan extends TestPlan.extend<ExecutedTestPlan>(
  "@supervisor/ExecutedTestPlan"
)({
  events: Schema.Array(ExecutionEvent),
}) {
  addEvent(part: LanguageModelV3StreamPart): ExecutedTestPlan {
    if (part.type === "reasoning-start") {
      return new ExecutedTestPlan({
        ...this,
        events: [...this.events, new AgentThinking({ text: "" })],
      });
    }

    if (part.type === "reasoning-delta") {
      const lastEvent = this.events.at(-1);
      if (lastEvent?._tag !== "AgentThinking") return this;
      return new ExecutedTestPlan({
        ...this,
        events: [
          ...this.events.slice(0, -1),
          new AgentThinking({ text: lastEvent.text + part.delta }),
        ],
      });
    }

    if (part.type === "text-start") {
      return new ExecutedTestPlan({
        ...this,
        events: [...this.events, new AgentText({ text: "" })],
      });
    }

    if (part.type === "text-delta") {
      const lastEvent = this.events.at(-1);
      if (lastEvent?._tag !== "AgentText") return this;
      return new ExecutedTestPlan({
        ...this,
        events: [
          ...this.events.slice(0, -1),
          new AgentText({ text: lastEvent.text + part.delta }),
        ],
      });
    }

    /** @note(rasmus): handle markers when the text block ends */
    if (part.type === "text-end") {
      const lastEvent = this.events.at(-1);
      if (lastEvent?._tag !== "AgentText") return this;
      const foundMarkers = lastEvent.text
        .split("\n")
        .map(parseMarker)
        .filter(Predicate.isNotUndefined);
      if (foundMarkers.length === 0) return this;
      let result: ExecutedTestPlan = new ExecutedTestPlan({
        ...this,
        events: [...this.events, ...foundMarkers],
      });
      for (const marker of foundMarkers) {
        result = result.applyMarker(marker);
      }
      return result;
    }

    if (part.type === "tool-call") {
      return new ExecutedTestPlan({
        ...this,
        events: [
          ...this.events,
          new ToolCall({ toolName: part.toolName, input: part.input }),
        ],
      });
    }

    if (part.type === "tool-result") {
      return new ExecutedTestPlan({
        ...this,
        events: [
          ...this.events,
          new ToolResult({
            toolName: part.toolName,
            result: serializeToolResult(part.result),
            isError: Boolean(part.isError),
          }),
        ],
      });
    }

    return this;
  }

  applyMarker(marker: ExecutionEvent): ExecutedTestPlan {
    if (marker._tag === "StepStarted") {
      return new ExecutedTestPlan({
        ...this,
        steps: this.steps.map((step) =>
          step.id === marker.stepId
            ? step.update({
                status: "active",
                startedAt: Option.some(DateTime.nowUnsafe()),
              })
            : step
        ),
      });
    }
    if (marker._tag === "StepCompleted") {
      return new ExecutedTestPlan({
        ...this,
        steps: this.steps.map((step) =>
          step.id === marker.stepId
            ? step.update({
                status: "passed",
                summary: Option.some(marker.summary),
                endedAt: Option.some(DateTime.nowUnsafe()),
              })
            : step
        ),
      });
    }
    if (marker._tag === "StepFailed") {
      return new ExecutedTestPlan({
        ...this,
        steps: this.steps.map((step) =>
          step.id === marker.stepId
            ? step.update({
                status: "failed",
                summary: Option.some(marker.message),
                endedAt: Option.some(DateTime.nowUnsafe()),
              })
            : step
        ),
      });
    }
    return this;
  }

  get activeStep(): TestPlanStep | undefined {
    return this.steps.find((step) => step.status === "active");
  }

  get completedStepCount(): number {
    return this.steps.filter(
      (step) => step.status === "passed" || step.status === "failed"
    ).length;
  }

  get lastToolCallDisplayText(): string | undefined {
    const lastToolCall = this.events.findLast(
      (event) => event._tag === "ToolCall"
    );
    if (!lastToolCall || lastToolCall._tag !== "ToolCall") return undefined;
    return lastToolCall.displayText;
  }
}

export class TestReport extends ExecutedTestPlan.extend<TestReport>(
  "@supervisor/TestReport"
)({
  summary: Schema.String,
  screenshotPaths: Schema.Array(Schema.String),
  pullRequest: Schema.Option(Schema.suspend(() => PullRequest)),
}) {
  /** @todo(rasmus): UNUSED */
  get stepStatuses(): ReadonlyMap<
    StepId,
    { status: "passed" | "failed" | "not-run"; summary: string }
  > {
    const statuses = new Map<
      StepId,
      { status: "passed" | "failed" | "not-run"; summary: string }
    >(this.steps.map((step) => [step.id, { status: "not-run", summary: "" }]));

    for (const event of this.events) {
      if (event._tag === "StepCompleted") {
        statuses.set(event.stepId, {
          status: "passed",
          summary: event.summary,
        });
      } else if (event._tag === "StepFailed") {
        statuses.set(event.stepId, {
          status: "failed",
          summary: event.message,
        });
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
      lines.push(
        `${stepStatus.toUpperCase()} ${step.title}: ${entry?.summary ?? ""}`
      );
    }
    return lines.join("\n");
  }
}
