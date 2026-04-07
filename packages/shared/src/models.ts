import { DateTime, Match, Option, Predicate, Schema } from "effect";

export interface SavedFlowStep {
  id: string;
  title: string;
  instruction: string;
  expectedOutcome: string;
}

export interface SavedFlow {
  title: string;
  userInstruction: string;
  steps: SavedFlowStep[];
}

const AcpToolCallStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const);

const AcpToolKind = Schema.Literals([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
] as const);

const AcpStopReason = Schema.Literals([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
] as const);

const AcpContentBlock = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("image"),
    data: Schema.String,
    mimeType: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("resource_link"), uri: Schema.String }),
  Schema.Struct({ type: Schema.Literal("resource"), uri: Schema.String }),
]);

const AcpToolCallContent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("content"),
    content: AcpContentBlock,
  }),
  Schema.Struct({
    type: Schema.Literal("diff"),
    path: Schema.String,
    oldText: Schema.optional(Schema.NullOr(Schema.String)),
    newText: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("terminal"),
    terminalId: Schema.String,
  }),
]);

const AcpToolCallLocation = Schema.Struct({
  path: Schema.String,
  lineNumber: Schema.optional(Schema.NullOr(Schema.Number)),
});

export class AcpAgentMessageChunk extends Schema.Class<AcpAgentMessageChunk>(
  "AcpAgentMessageChunk",
)({
  sessionUpdate: Schema.Literal("agent_message_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

export class AcpAgentThoughtChunk extends Schema.Class<AcpAgentThoughtChunk>(
  "AcpAgentThoughtChunk",
)({
  sessionUpdate: Schema.Literal("agent_thought_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

export class AcpUserMessageChunk extends Schema.Class<AcpUserMessageChunk>("AcpUserMessageChunk")({
  sessionUpdate: Schema.Literal("user_message_chunk"),
  content: AcpContentBlock,
  messageId: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

export class AcpToolCall extends Schema.Class<AcpToolCall>("AcpToolCall")({
  sessionUpdate: Schema.Literal("tool_call"),
  toolCallId: Schema.String,
  title: Schema.String,
  kind: Schema.optional(AcpToolKind),
  status: Schema.optional(AcpToolCallStatus),
  content: Schema.optional(Schema.Array(AcpToolCallContent)),
  locations: Schema.optional(Schema.Array(AcpToolCallLocation)),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
}) {}

export class AcpToolCallUpdate extends Schema.Class<AcpToolCallUpdate>("AcpToolCallUpdate")({
  sessionUpdate: Schema.Literal("tool_call_update"),
  toolCallId: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  kind: Schema.optional(Schema.NullOr(AcpToolKind)),
  status: Schema.optional(Schema.NullOr(AcpToolCallStatus)),
  content: Schema.optional(Schema.NullOr(Schema.Array(AcpToolCallContent))),
  locations: Schema.optional(Schema.NullOr(Schema.Array(AcpToolCallLocation))),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
}) {}

const AcpPlanEntryStatus = Schema.Literals(["pending", "in_progress", "completed"] as const);

const AcpPlanEntryPriority = Schema.Literals(["high", "medium", "low"] as const);

export class AcpPlanUpdate extends Schema.Class<AcpPlanUpdate>("AcpPlanUpdate")({
  sessionUpdate: Schema.Literal("plan"),
  entries: Schema.Array(
    Schema.Struct({
      content: Schema.String,
      priority: AcpPlanEntryPriority,
      status: AcpPlanEntryStatus,
    }),
  ),
}) {}

export class AcpAvailableCommandsUpdate extends Schema.Class<AcpAvailableCommandsUpdate>(
  "AcpAvailableCommandsUpdate",
)({
  sessionUpdate: Schema.Literal("available_commands_update"),
}) {}

export class AcpCurrentModeUpdate extends Schema.Class<AcpCurrentModeUpdate>(
  "AcpCurrentModeUpdate",
)({
  sessionUpdate: Schema.Literal("current_mode_update"),
}) {}

const AcpConfigOptionCategory = Schema.Union([
  Schema.Literal("mode"),
  Schema.Literal("model"),
  Schema.Literal("thought_level"),
  Schema.String,
]);

export const AcpConfigSelectOption = Schema.Struct({
  value: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
});
export type AcpConfigSelectOption = typeof AcpConfigSelectOption.Type;

const AcpConfigSelectGroup = Schema.Struct({
  group: Schema.String,
  name: Schema.String,
  options: Schema.Array(AcpConfigSelectOption),
});

export const AcpConfigOption = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: Schema.optional(Schema.NullOr(AcpConfigOptionCategory)),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.Literals(["select", "boolean"] as const),
  currentValue: Schema.Union([Schema.String, Schema.Boolean]),
  options: Schema.optional(
    Schema.Array(Schema.Union([AcpConfigSelectOption, AcpConfigSelectGroup])),
  ),
});
export type AcpConfigOption = typeof AcpConfigOption.Type;

export class AcpConfigOptionUpdate extends Schema.Class<AcpConfigOptionUpdate>(
  "AcpConfigOptionUpdate",
)({
  sessionUpdate: Schema.Literal("config_option_update"),
  configOptions: Schema.Array(AcpConfigOption),
}) {}

export class AcpSessionInfoUpdate extends Schema.Class<AcpSessionInfoUpdate>(
  "AcpSessionInfoUpdate",
)({
  sessionUpdate: Schema.Literal("session_info_update"),
}) {}

export class AcpUsageUpdate extends Schema.Class<AcpUsageUpdate>("AcpUsageUpdate")({
  sessionUpdate: Schema.Literal("usage_update"),
}) {}

export const AcpSessionUpdate = Schema.Union([
  AcpAgentMessageChunk,
  AcpAgentThoughtChunk,
  AcpUserMessageChunk,
  AcpToolCall,
  AcpToolCallUpdate,
  AcpPlanUpdate,
  AcpAvailableCommandsUpdate,
  AcpCurrentModeUpdate,
  AcpConfigOptionUpdate,
  AcpSessionInfoUpdate,
  AcpUsageUpdate,
]);
export type AcpSessionUpdate = typeof AcpSessionUpdate.Type;

export class AcpSessionNotification extends Schema.Class<AcpSessionNotification>(
  "AcpSessionNotification",
)({
  sessionId: Schema.String,
  update: AcpSessionUpdate,
}) {}

export const AcpUsage = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cachedReadTokens: Schema.optional(Schema.NullOr(Schema.Number)),
  cachedWriteTokens: Schema.optional(Schema.NullOr(Schema.Number)),
  thoughtTokens: Schema.optional(Schema.NullOr(Schema.Number)),
});

export class AcpPromptResponse extends Schema.Class<AcpPromptResponse>("AcpPromptResponse")({
  stopReason: AcpStopReason,
  usage: Schema.optional(Schema.NullOr(AcpUsage)),
}) {}

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
  "copilot",
  "gemini",
  "cursor",
  "opencode",
  "droid",
  "pi",
] as const);
export type AgentProvider = typeof AgentProvider.Type;

export const AGENT_PROVIDER_DISPLAY_NAMES: Record<AgentProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  copilot: "GitHub Copilot",
  gemini: "Gemini",
  cursor: "Cursor",
  opencode: "OpenCode",
  droid: "Factory Droid",
  pi: "Pi",
};
const TOOL_CALL_DISPLAY_TEXT_CHAR_LIMIT = 80;

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
  workingTreeFileStats: Schema.Array(FileStat),
  fingerprint: Schema.UndefinedOr(Schema.String),
  savedFingerprint: Schema.UndefinedOr(Schema.String),
}) {
  get hasUntestedChanges(): boolean {
    return this.hasChangesFromMain || this.hasUnstagedChanges;
  }

  get totalChangedLines(): number {
    return this.fileStats.reduce((sum, stat) => sum + stat.added + stat.removed, 0);
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

export const StepStatus = Schema.Literals(["pending", "active", "passed", "failed", "skipped"]);
export type StepStatus = typeof StepStatus.Type;

export class TestPlanStep extends Schema.Class<TestPlanStep>("@supervisor/TestPlanStep")({
  id: StepId,
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.OptionFromNullOr(Schema.String),
  status: StepStatus,
  summary: Schema.OptionFromNullOr(Schema.String),
  startedAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
  endedAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
}) {
  update(
    fields: Partial<
      Pick<
        TestPlanStep,
        "title" | "instruction" | "expectedOutcome" | "status" | "summary" | "startedAt" | "endedAt"
      >
    >,
  ): TestPlanStep {
    return new TestPlanStep({ ...this, ...fields });
  }
}

export class TestCoverageEntry extends Schema.Class<TestCoverageEntry>(
  "@supervisor/TestCoverageEntry",
)({
  path: Schema.String,
  testFiles: Schema.Array(Schema.String),
  covered: Schema.Boolean,
}) {}

export class TestCoverageReport extends Schema.Class<TestCoverageReport>(
  "@supervisor/TestCoverageReport",
)({
  entries: Schema.Array(TestCoverageEntry),
  coveredCount: Schema.Number,
  totalCount: Schema.Number,
  percent: Schema.Number,
}) {}

export const DraftId = Schema.String.pipe(Schema.brand("DraftId"));
export type DraftId = typeof DraftId.Type;

export class TestPlanDraft extends Schema.Class<TestPlanDraft>("@supervisor/TestPlanDraft")({
  id: DraftId,
  changesFor: ChangesFor,
  currentBranch: Schema.String,
  diffPreview: Schema.String,
  fileStats: Schema.Array(FileStat),
  instruction: Schema.String,
  baseUrl: Schema.Option(Schema.String),
  isHeadless: Schema.Boolean,
  cookieBrowserKeys: Schema.Array(Schema.String),
  testCoverage: Schema.Option(TestCoverageReport),
}) {
  get requiresCookies(): boolean {
    return this.cookieBrowserKeys.length > 0;
  }

  update(
    fields: Partial<
      Pick<TestPlanDraft, "instruction" | "baseUrl" | "isHeadless" | "cookieBrowserKeys">
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
  update(
    fields: Partial<
      Pick<TestPlanDraft, "instruction" | "baseUrl" | "isHeadless" | "cookieBrowserKeys">
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

  get stepCount(): number {
    return this.steps.length;
  }

  get resetForRerun(): TestPlan {
    return new TestPlan({
      ...this,
      steps: this.steps.map(
        (step) =>
          new TestPlanStep({
            ...step,
            status: "pending",
            summary: Option.none(),
            startedAt: Option.none(),
            endedAt: Option.none(),
          }),
      ),
    });
  }
}

export class RunStarted extends Schema.TaggedClass<RunStarted>()("RunStarted", {
  plan: TestPlan,
}) {
  get id(): string {
    return `run-started-${this.plan.id}`;
  }
}

export class StepStarted extends Schema.TaggedClass<StepStarted>()("StepStarted", {
  stepId: StepId,
  title: Schema.String,
}) {
  get id(): string {
    return `step-started-${this.stepId}`;
  }
}

export class StepCompleted extends Schema.TaggedClass<StepCompleted>()("StepCompleted", {
  stepId: StepId,
  summary: Schema.String,
}) {
  get id(): string {
    return `step-completed-${this.stepId}`;
  }
}

export class StepFailed extends Schema.TaggedClass<StepFailed>()("StepFailed", {
  stepId: StepId,
  message: Schema.String,
}) {
  get id(): string {
    return `step-failed-${this.stepId}`;
  }
}

export class StepSkipped extends Schema.TaggedClass<StepSkipped>()("StepSkipped", {
  stepId: StepId,
  reason: Schema.String,
}) {
  get id(): string {
    return `step-skipped-${this.stepId}`;
  }
}

export class ToolCall extends Schema.TaggedClass<ToolCall>()("ToolCall", {
  toolName: Schema.String,
  input: Schema.Unknown,
}) {
  get id(): string {
    return `tool-call-${this.toolName}-${JSON.stringify(this.input)}`;
  }
  get displayText(): string {
    if (Predicate.isObject(this.input) && "command" in this.input) {
      return String(this.input.command).slice(0, TOOL_CALL_DISPLAY_TEXT_CHAR_LIMIT);
    }
    return this.toolName;
  }
}

export class ToolProgress extends Schema.TaggedClass<ToolProgress>()("ToolProgress", {
  toolName: Schema.String,
  outputSize: Schema.Number,
}) {
  get id(): string {
    return `tool-progress-${this.toolName}-${this.outputSize}`;
  }
}

export class ToolResult extends Schema.TaggedClass<ToolResult>()("ToolResult", {
  toolName: Schema.String,
  result: Schema.String,
  isError: Schema.Boolean,
}) {
  get id(): string {
    return `tool-result-${this.toolName}-${this.result}`;
  }
}

export class AgentThinking extends Schema.TaggedClass<AgentThinking>()("AgentThinking", {
  text: Schema.String,
}) {
  get id(): string {
    return `agent-thinking-${this.text}`;
  }
}

export class AgentText extends Schema.TaggedClass<AgentText>()("AgentText", {
  text: Schema.String,
}) {
  get id(): string {
    return `agent-text-${this.text}`;
  }
}

export class RunFinished extends Schema.TaggedClass<RunFinished>()("RunFinished", {
  status: Schema.Literals(["passed", "failed"] as const),
  summary: Schema.String,
}) {
  get id(): string {
    return `run-finished-${this.status}`;
  }
}

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
  if (marker === "STEP_SKIPPED") {
    return new StepSkipped({
      stepId: StepId.makeUnsafe(first),
      reason: second,
    });
  }
  if (marker === "RUN_COMPLETED") {
    const status = first === "failed" ? ("failed" as const) : ("passed" as const);
    return new RunFinished({ status, summary: second });
  }
  return undefined;
};

export const ExecutionEvent = Schema.Union([
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  StepSkipped,
  ToolCall,
  ToolProgress,
  ToolResult,
  AgentThinking,
  AgentText,
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
  StepSkipped,
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
  addEvent(update: AcpSessionUpdate): ExecutedTestPlan {
    if (update.sessionUpdate === "agent_thought_chunk") {
      if (update.content.type !== "text" || update.content.text === undefined) return this;
      const lastEvent = this.events.at(-1);
      if (lastEvent?._tag === "AgentThinking") {
        return new ExecutedTestPlan({
          ...this,
          events: [
            ...this.events.slice(0, -1),
            new AgentThinking({ text: lastEvent.text + update.content.text }),
          ],
        });
      }
      const base = this.finalizeTextBlock();
      return new ExecutedTestPlan({
        ...base,
        events: [...base.events, new AgentThinking({ text: update.content.text })],
      });
    }

    if (update.sessionUpdate === "agent_message_chunk") {
      if (update.content.type !== "text" || update.content.text === undefined) return this;
      const lastEvent = this.events.at(-1);
      if (lastEvent?._tag === "AgentText") {
        return new ExecutedTestPlan({
          ...this,
          events: [
            ...this.events.slice(0, -1),
            new AgentText({ text: lastEvent.text + update.content.text }),
          ],
        });
      }
      const base = this.finalizeTextBlock();
      return new ExecutedTestPlan({
        ...base,
        events: [...base.events, new AgentText({ text: update.content.text })],
      });
    }

    if (update.sessionUpdate === "tool_call") {
      let result = this.finalizeTextBlock();
      return new ExecutedTestPlan({
        ...result,
        events: [
          ...result.events,
          new ToolCall({
            toolName: update.title,
            input: JSON.stringify(update.rawInput ?? {}),
          }),
        ],
      });
    }

    if (update.sessionUpdate === "tool_call_update") {
      let base: ExecutedTestPlan | undefined;

      if (update.rawInput !== undefined) {
        const updatedEvents = [...this.events];
        for (let index = updatedEvents.length - 1; index >= 0; index--) {
          const event = updatedEvents[index];
          if (event._tag === "ToolCall" && event.toolName === (update.title ?? "")) {
            updatedEvents[index] = new ToolCall({
              toolName: event.toolName,
              input: JSON.stringify(update.rawInput),
            });
            break;
          }
        }
        base = new ExecutedTestPlan({ ...this, events: updatedEvents });
      }

      const current = base ?? this;

      if (update.status === "completed" || update.status === "failed") {
        return new ExecutedTestPlan({
          ...current,
          events: [
            ...current.events,
            new ToolResult({
              toolName: update.title ?? "",
              result: serializeToolResult(update.rawOutput),
              isError: update.status === "failed",
            }),
          ],
        });
      }
      if (update.rawOutput !== undefined) {
        const outputSize = serializeToolResult(update.rawOutput).length;
        return new ExecutedTestPlan({
          ...current,
          events: [
            ...current.events.filter(
              (event) =>
                !(event._tag === "ToolProgress" && event.toolName === (update.title ?? "")),
            ),
            new ToolProgress({
              toolName: update.title ?? "",
              outputSize,
            }),
          ],
        });
      }
      return current;
    }

    return this;
  }

  finalizeTextBlock(): ExecutedTestPlan {
    const lastEvent = this.events.at(-1);
    if (lastEvent?._tag !== "AgentText" && lastEvent?._tag !== "AgentThinking") return this;
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

  applyMarker(marker: ExecutionEvent): ExecutedTestPlan {
    if (marker._tag === "StepStarted") {
      const stepExists = this.steps.some((step) => step.id === marker.stepId);
      if (stepExists) {
        return new ExecutedTestPlan({
          ...this,
          steps: this.steps.map((step) =>
            step.id === marker.stepId
              ? step.update({
                  status: "active",
                  title: marker.title,
                  startedAt: Option.some(DateTime.nowUnsafe()),
                })
              : step,
          ),
        });
      }
      return new ExecutedTestPlan({
        ...this,
        steps: [
          ...this.steps,
          new TestPlanStep({
            id: marker.stepId,
            title: marker.title,
            instruction: marker.title,
            expectedOutcome: "",
            routeHint: Option.none(),
            status: "active",
            summary: Option.none(),
            startedAt: Option.some(DateTime.nowUnsafe()),
            endedAt: Option.none(),
          }),
        ],
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
                expectedOutcome: marker.summary,
                endedAt: Option.some(DateTime.nowUnsafe()),
              })
            : step,
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
                expectedOutcome: marker.message,
                endedAt: Option.some(DateTime.nowUnsafe()),
              })
            : step,
        ),
      });
    }
    if (marker._tag === "StepSkipped") {
      return new ExecutedTestPlan({
        ...this,
        steps: this.steps.map((step) =>
          step.id === marker.stepId
            ? step.update({
                status: "skipped",
                summary: Option.some(marker.reason),
                endedAt: Option.some(DateTime.nowUnsafe()),
              })
            : step,
        ),
      });
    }
    return this;
  }

  get hasRunFinished(): boolean {
    return this.events.some((event) => event._tag === "RunFinished");
  }

  get allStepsTerminal(): boolean {
    return (
      this.steps.length > 0 &&
      this.steps.every(
        (step) => step.status === "passed" || step.status === "failed" || step.status === "skipped",
      )
    );
  }

  synthesizeRunFinished(): ExecutedTestPlan {
    if (this.hasRunFinished) return this;
    if (this.steps.length === 0) {
      return new ExecutedTestPlan({
        ...this,
        events: [
          ...this.events,
          new RunFinished({
            status: "failed",
            summary: "Agent completed without executing any test steps",
          }),
        ],
      });
    }
    const hasFailures = this.steps.some((step) => step.status === "failed");
    const status = hasFailures ? ("failed" as const) : ("passed" as const);
    const passedCount = this.steps.filter((step) => step.status === "passed").length;
    const failedCount = this.steps.filter((step) => step.status === "failed").length;
    const skippedCount = this.steps.filter((step) => step.status === "skipped").length;
    const parts = [`${passedCount} passed`, `${failedCount} failed`];
    if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
    const summary = `Run auto-completed: ${parts.join(", ")}`;
    return new ExecutedTestPlan({
      ...this,
      events: [...this.events, new RunFinished({ status, summary })],
    });
  }

  get activeStep(): TestPlanStep | undefined {
    return this.steps.find((step) => step.status === "active");
  }

  get completedStepCount(): number {
    return this.steps.filter(
      (step) => step.status === "passed" || step.status === "failed" || step.status === "skipped",
    ).length;
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
  testCoverageReport: Schema.Option(TestCoverageReport),
}) {
  /** @todo(rasmus): UNUSED */
  get stepStatuses(): ReadonlyMap<
    StepId,
    { status: "passed" | "failed" | "skipped" | "not-run"; summary: string }
  > {
    const statuses = new Map<
      StepId,
      { status: "passed" | "failed" | "skipped" | "not-run"; summary: string }
    >(this.steps.map((step) => [step.id, { status: "not-run", summary: "" }]));

    for (const event of this.events) {
      if (event._tag === "StepCompleted" && statuses.has(event.stepId)) {
        statuses.set(event.stepId, {
          status: "passed",
          summary: event.summary,
        });
      } else if (event._tag === "StepFailed" && statuses.has(event.stepId)) {
        statuses.set(event.stepId, {
          status: "failed",
          summary: event.message,
        });
      } else if (event._tag === "StepSkipped" && statuses.has(event.stepId)) {
        statuses.set(event.stepId, {
          status: "skipped",
          summary: event.reason,
        });
      }
    }

    return statuses;
  }

  get status(): "passed" | "failed" {
    for (const { status } of this.stepStatuses.values()) {
      if (status === "failed") return "failed";
    }
    return "passed";
  }

  get toPlainText(): string {
    const statuses = this.stepStatuses;
    const passedCount = this.steps.filter(
      (step) => statuses.get(step.id)?.status === "passed",
    ).length;
    const failedCount = this.steps.filter(
      (step) => statuses.get(step.id)?.status === "failed",
    ).length;
    const skippedCount = this.steps.filter(
      (step) => statuses.get(step.id)?.status === "skipped",
    ).length;

    const icon = this.status === "passed" ? "\u2705" : "\u274C";
    const summaryParts = [`${passedCount} passed`, `${failedCount} failed`];
    if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
    const countSummary = summaryParts.join(", ");
    const summaryText = this.summary.trim();
    const stepWord = this.steps.length === 1 ? "step" : "steps";
    const lines = [
      `${icon} ${this.title} \u2014 ${this.status.toUpperCase()}`,
      "",
      this.steps.length === 0
        ? "agent did not execute any test steps"
        : `${countSummary} out of ${this.steps.length} ${stepWord}`,
      "",
    ];

    for (const step of this.steps) {
      const entry = statuses.get(step.id);
      const stepStatus = entry?.status ?? "not-run";
      const stepIcon =
        stepStatus === "passed"
          ? "\u2713"
          : stepStatus === "failed"
            ? "\u2717"
            : stepStatus === "skipped"
              ? "\u2192"
              : "\u2013";
      lines.push(`  ${stepIcon} ${step.title}`);
      if (entry?.summary) {
        lines.push(`    ${entry.summary}`);
      }
    }

    if (summaryText.length > 0 && summaryText !== countSummary) {
      lines.push("");
      lines.push("Summary");
      lines.push(summaryText);
    }

    if (Option.isSome(this.testCoverageReport)) {
      const coverage = this.testCoverageReport.value;
      lines.push("");
      lines.push(
        `Test coverage: ${coverage.percent}% (${coverage.coveredCount}/${coverage.totalCount} changed files have tests)`,
      );
      const uncovered = coverage.entries.filter((entry) => !entry.covered);
      if (uncovered.length > 0) {
        lines.push("  Untested files:");
        for (const entry of uncovered) {
          lines.push(`    - ${entry.path}`);
        }
      }
    }

    return lines.join("\n");
  }
}

export class CiStepResult extends Schema.Class<CiStepResult>("@shared/CiStepResult")({
  title: Schema.String,
  status: Schema.Literals(["passed", "failed", "skipped", "not-run"] as const),
  duration_ms: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
}) {}

export class CiResultOutput extends Schema.Class<CiResultOutput>("@shared/CiResultOutput")({
  version: Schema.String,
  status: Schema.Literals(["passed", "failed"] as const),
  title: Schema.String,
  duration_ms: Schema.Number,
  steps: Schema.Array(CiStepResult),
  artifacts: Schema.Struct({
    video: Schema.optional(Schema.String),
    replay: Schema.optional(Schema.String),
    screenshots: Schema.optional(Schema.Array(Schema.String)),
  }),
  summary: Schema.String,
}) {}
