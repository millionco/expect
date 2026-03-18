# Supervisor Refactor

Rebuild `packages/supervisor` around a clean set of Effect services and domain models.
Remove all the accidental complexity that's accumulated.

---

## What's being removed

- `ModelRunner` — assume the provider is available, no fallback chains
- `StreamParser` — replaced by `Updates` pubsub service
- `generateBrowserPlan` / `resolveBrowserTarget` / `getBrowserEnvironment` — orchestration noise, belongs in the CLI
- `createDirectRunPlan` — stays as a pure function, not part of any service
- `BrowserRunReport` with findings, risk area summaries, share bundles, HTML generation, ffmpeg highlight video — all gone
- `BrowserRunEvent` union of interfaces — replaced by `UpdateContent` tagged union of Schema classes

---

## Branded IDs

```ts
export const StepId = Schema.String.pipe(Schema.brand("StepId"));
export type StepId = typeof StepId.Type;

export const PlanId = Schema.String.pipe(Schema.brand("PlanId"));
export type PlanId = typeof PlanId.Type;
```

---

## Domain Models

### `TestPlanDraft`

What the CLI gives the `Planner`. Uses existing git models directly — no invented types.

```ts
export class TestPlanDraft extends Schema.Class<TestPlanDraft>("@supervisor/TestPlanDraft")({
  // from git service
  changesFor: ChangesFor, // WorkingTree | Branch { base, branchName } | Commit { hash }
  currentBranch: Schema.String,
  diffs: Schema.Array(Diff), // full before/after content per file
  fileStats: Schema.Array(FileStat), // relativePath, added, removed

  // what to test
  instruction: Schema.String,

  // browser environment
  baseUrl: Schema.Option(Schema.String),
  isHeadless: Schema.Boolean,
  requiresCookies: Schema.Boolean,
}) {
  get prompt(): string {
    // builds the planning prompt from this draft's fields
    // changesFor, diffs, fileStats, instruction, baseUrl, etc.
  }
}
```

The CLI constructs this by calling `git.getChanges(changesFor)` and `git.getWorkingTreeFileStats()`.

### `TestPlanStep`

```ts
export class TestPlanStep extends Schema.Class<TestPlanStep>("@supervisor/TestPlanStep")({
  id: StepId,
  title: Schema.String,
  instruction: Schema.String,
  expectedOutcome: Schema.String,
  routeHint: Schema.Option(Schema.String),
}) {}
```

### `TestPlan`

Extends `TestPlanDraft` with the AI-generated fields. Passed directly to `Executor`.

```ts
export class TestPlan extends TestPlanDraft.extend<TestPlan>("@supervisor/TestPlan")({
  id: PlanId,
  title: Schema.String,
  rationale: Schema.String,
  steps: Schema.Array(TestPlanStep),
}) {
  get prompt(): string {
    // builds the execution prompt from this plan's fields
    // steps, baseUrl, requiresCookies, isHeadless, etc.
  }
}
```

### `ExecutedTestPlan`

A `TestPlan` with its accumulated execution events. Immutable — `addEvent` returns a new instance.
The Executor folds events into it as they arrive; the Reporter reads from it to build the report.

```ts
export class ExecutedTestPlan extends TestPlan.extend<ExecutedTestPlan>(
  "@supervisor/ExecutedTestPlan",
)({
  events: Schema.Array(UpdateContent),
}) {
  addEvent(event: UpdateContent): ExecutedTestPlan {
    return new ExecutedTestPlan({ ...this, events: [...this.events, event] });
  }

  get testReport(): TestReport {
    // derives TestReportStep[] from StepCompleted / StepFailed events
    // derives summary from RunCompleted event
    // screenshotPaths from ToolResult events where toolName === "screenshot"
  }
}
```

### `TestReportStep`

```ts
export class TestReportStep extends Schema.Class<TestReportStep>("@supervisor/TestReportStep")({
  stepId: StepId,
  title: Schema.String,
  status: Schema.Literal("passed", "failed", "not-run"),
  summary: Schema.String,
}) {}
```

### `TestReport`

Derived from `ExecutedTestPlan`. `status` computed from steps.

```ts
export class TestReport extends Schema.Class<TestReport>("@supervisor/TestReport")({
  plan: ExecutedTestPlan,
  summary: Schema.String,
  steps: Schema.Array(TestReportStep),
  screenshotPaths: Schema.Array(Schema.String),
}) {
  get status(): "passed" | "failed" {
    return this.steps.every((step) => step.status !== "failed") ? "passed" : "failed";
  }
}
```

---

## Updates Service

PubSub for execution events. The executor publishes, the CLI subscribes via `stream()`.
No repo — ephemeral only.

### `UpdateContent` variants

```ts
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

export class RunCompleted extends Schema.TaggedClass<RunCompleted>()("RunCompleted", {
  status: Schema.Literal("passed", "failed"),
  summary: Schema.String,
  report: TestReport,
}) {}

export const UpdateContent = Schema.Union(
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  ToolCall,
  ToolResult,
  AgentThinking,
  RunCompleted,
);
export type UpdateContent = typeof UpdateContent.Type;
```

### `Updates` service

```ts
export class Updates extends ServiceMap.Service<Updates>()("@supervisor/Updates", {
  make: Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<UpdateContent>();

    const publish = Effect.fn("Updates.publish")(function* (content: UpdateContent) {
      yield* PubSub.publish(pubsub, content);
    });

    const stream = Effect.fn("Updates.stream")(function* () {
      return Stream.fromPubSub(pubsub);
    });

    return { publish, stream } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
```

---

## Planner Service

Depends on `Agent`. Calls `agent.stream(AgentStreamOptions)`, collects all stream parts, extracts text, parses JSON into `TestPlan`.

```ts
export class PlanningError extends Schema.ErrorClass<PlanningError>("PlanningError")({
  _tag: Schema.tag("PlanningError"),
  cause: Schema.Unknown,
}) {
  message = `Planning failed: ${String(this.cause)}`;
}

export class Planner extends ServiceMap.Service<Planner>()("@supervisor/Planner", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;

    const plan = Effect.fn("Planner.plan")(function* (draft: TestPlanDraft) {
      const text = yield* agent
        .stream(
          new AgentStreamOptions({
            cwd: process.cwd(),
            model: PLANNER_MODEL,
            sessionId: Option.none(),
            prompt: draft.prompt,
            systemPrompt: Option.none(),
          }),
        )
        .pipe(
          Stream.filterMap(extractTextDelta), // pull text-delta parts
          Stream.runFold("", (acc, chunk) => acc + chunk),
          Effect.mapError((cause) => new PlanningError({ cause })),
        );

      // extract JSON, decode into TestPlan schema
      return yield* parsePlanFromText(text, draft).pipe(
        Effect.mapError((cause) => new PlanningError({ cause })),
      );
    });

    return { plan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
```

`Planner.plan` is the only entry point. The CLI constructs `TestPlanDraft` and calls it directly.

---

## Executor Service

Depends on `Agent` and `Updates`. Calls `agent.stream(AgentStreamOptions)`, maps each stream part to an `UpdateContent`, publishes to `Updates`.

```ts
export class ExecutionError extends Schema.ErrorClass<ExecutionError>("ExecutionError")({
  _tag: Schema.tag("ExecutionError"),
  cause: Schema.Unknown,
}) {
  message = `Execution failed: ${String(this.cause)}`;
}

export class Executor extends ServiceMap.Service<Executor>()("@supervisor/Executor", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;
    const updates = yield* Updates;

    const executePlan = Effect.fn("Executor.executePlan")(function* (plan: TestPlan) {
      const runStarted = new RunStarted({ plan });
      yield* updates.publish(runStarted);

      return yield* agent
        .stream(
          new AgentStreamOptions({
            cwd: process.cwd(),
            model: EXECUTOR_MODEL,
            sessionId: Option.none(),
            prompt: plan.prompt,
            systemPrompt: Option.none(),
          }),
        )
        .pipe(
          Stream.mapEffect((part) => streamPartToUpdate(part, plan)), // pure mapping + marker parsing
          Stream.filterMap(identity), // drop nulls (unrecognised parts)
          Stream.tap((update) => updates.publish(update)),
          Stream.runFold(
            new ExecutedTestPlan({ ...plan, events: [runStarted] }),
            (executed, event) => executed.addEvent(event),
          ),
          Effect.mapError((cause) => new ExecutionError({ cause })),
        );
    });

    return { executePlan } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Updates.layer));
}
```

`executePlan` publishes all updates to `Updates`. The CLI subscribes to `updates.stream()` and renders. No return value.

---

## Reporter Service

Receives the completed `ExecutedTestPlan` from the Executor, builds `TestReport`, and publishes `RunCompleted`. No stream subscription needed — all events are already on the `ExecutedTestPlan`.

```ts
export class Reporter extends ServiceMap.Service<Reporter>()("@supervisor/Reporter", {
  make: Effect.gen(function* () {
    const updates = yield* Updates;

    const report = Effect.fn("Reporter.report")(function* (executed: ExecutedTestPlan) {
      yield* updates.publish(new RunCompleted({ report: executed.testReport }));
      return executed.testReport;
    });

    return { report } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(Updates.layer));
}
```

The CLI calls them in sequence: `executor.executePlan(plan)` → `reporter.report(executedPlan)`.

---

## What stays the same

- `Git` service — unchanged
- `FlowStorage` service — unchanged
- `createDirectRunPlan` — stays as a pure function (no AI, just wraps instruction into a single-step `TestPlan`)
- `getFlowSuggestionsFromContext` — pure function, stays as-is
- `generateFlowSuggestions` — stays as a standalone async function
- `getHealthcheckReport` — stays as a pure function
- `GitHub` (`postPullRequestComment`, `getPullRequestForBranch`) — stays as standalone async functions for now

---

## Layer composition

```
Updates.layer
Planner.layer   ← requires Agent
Executor.layer  ← provides Updates.layer, requires Agent
Reporter.layer  ← provides Updates.layer
```

`Agent` is not provided by any supervisor layer — the entrypoint picks the backend:

```ts
// CLI runtime
ManagedRuntime.make(
  Layer.mergeAll(
    Planner.layer,
    Executor.layer,
    Reporter.layer,
    Agent.layerClaude, // or Agent.layerCodex
  ),
);
```

Usage is sequential:

```ts
const executed = yield * executor.executePlan(plan);
const testReport = yield * reporter.report(executed);
```
