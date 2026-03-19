# CLI Migration Spec

Remove tech debt from `apps/cli` — eliminate invented intermediate types, stop using non-domain models, and extract all business logic out of React components.

---

## Two `ChangesFor` Types (Root Cause of Much Pain)

There are TWO incompatible `ChangesFor` types that the CLI must juggle:

| Location                                      | Kind              | Variants                                                                            |
| --------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `packages/shared/src/models.ts:42-47`         | `Schema.Union`    | `WorkingTree`, `Branch { branchName, base }`, `Commit { hash }`                     |
| `packages/supervisor/src/git/models.ts:22-28` | `Data.TaggedEnum` | `WorkingTree`, `Branch { mainBranch }`, `Changes { mainBranch }`, `Commit { hash }` |

The supervisor's version has an extra `Changes` variant and different field names (`mainBranch` vs `base`/`branchName`). The CLI imports from supervisor but has to manually translate when constructing `TestPlanDraft` (which uses the shared schema).

**Solution**: Consolidate into ONE `ChangesFor`. The shared schema should be the source of truth. The supervisor's `Data.TaggedEnum` should be removed, and the supervisor should use the shared schema's `ChangesFor` directly. If the `Changes` variant is needed, add it to the shared schema. If not, remove it.

---

## Invented Intermediate Types (Not Using Domain Models)

### [x] 1.`TestContext` — `utils/context-options.ts:5-17`

```ts
export interface TestContext {
  id: string;
  type: "changes" | "pr" | "branch" | "commit";
  label: string;
  description: string;
  filterText: string;
  branchName?: string;
  prNumber?: number;
  prStatus?: "open" | "draft" | "merged";
  commitHash?: string;
  commitShortHash?: string;
  commitSubject?: string;
}
```

This is a denormalized bag type that flattens `RemoteBranch`, `CommitSummary`, `PullRequest`, and `GitState` into one shape. It carries PR status, branch names, and commit hashes all in one loose interface instead of using the actual domain models.

**Used in**: `main-menu-screen.tsx`, `plan-review-screen.tsx`, `context-picker.tsx`, `use-flow-session.ts`, `get-flow-suggestions.ts`

**Solution**: Defined `TestContext` in `packages/shared/src/models.ts` as a `Schema.TaggedUnion`:

```ts
export const TestContext = Schema.TaggedUnion({
  WorkingTree: {},
  Branch: { branch: RemoteBranch },
  PullRequest: { branch: RemoteBranch },
  Commit: { hash: Schema.String, shortHash: Schema.String, subject: Schema.String },
});
export type TestContext = typeof TestContext.Type;
```

`WorkingTree` carries no extra fields — display info like unstaged changes, branch commit count, and file stats are already on `GitState`, which the component has access to. Each variant carries only the domain data specific to _what was selected_ (the remote branch, or the commit identity). Display label/description/filterText are derived at render time, not stored.

---

### [x] 2. `BrowserEnvironmentHints` — `utils/test-run-config.ts:7-11`

```ts
export interface BrowserEnvironmentHints {
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}
```

**Also duplicated as**: `EnvironmentOverrides` (same file, lines 13-17) — identical shape.

These overlap with `TestPlanDraft` fields (`baseUrl`, `isHeadless`, `requiresCookies`). The CLI stores these separately and then manually maps them when constructing a draft.

**Used in**: `use-flow-session.ts`, `use-preferences.ts`, `app.tsx`, `cookie-sync-confirm-screen.tsx`, `modeline.tsx`

**Solution**: Remove both. These values belong on `TestPlanDraft` — that's where they end up anyway. The only reason they're stored separately in a `PreferencesStore` is because the CLI builds the `TestPlanDraft` lazily (during the planning effect in `app.tsx`) and needs somewhere to stash user choices until then. That's a symptom of orchestration living in the wrong place. Once the supervisor owns the session lifecycle, the CLI passes these values when starting a session, and the supervisor puts them on the draft directly. No intermediate bag types needed.

---

### [x] 3. `TestRunConfig` — `utils/test-run-config.ts:19-30`

```ts
export interface TestRunConfig {
  action: "unstaged" | "branch" | "changes" | "commit";
  commitHash?: string;
  message?: string;
  flowSlug?: string;
  autoRun?: boolean;
  planningProvider?: AgentProvider;
  executionProvider?: AgentProvider;
  planningModel?: string;
  executionModel?: string;
  environmentOverrides?: EnvironmentOverrides;
}
```

The `action` field is a string union that must be manually mapped to `ChangesFor` in three separate places. `environmentOverrides` nests the duplicated `EnvironmentOverrides` type.

**Used in**: `index.tsx`, `run-test.ts`, `use-preferences.ts`

Every key is optional because CLI args are optional (`testie` with no flags). And `action` is a string instead of `ChangesFor` because resolving `ChangesFor` requires async git operations (getting `mainBranch`), so they deferred it. But every code path immediately resolves git state right after constructing this config — there's no reason for the intermediate step.

**Solution**: Remove entirely. The CLI should parse args → resolve git state → construct `TestPlanDraft` directly. No intermediate bag. The `--flow` flag loads a saved flow from the filesystem, which yields a `TestPlanDraft` or `TestPlan` — either way the codepath is the same (you either plan from a draft or skip planning with an existing plan). The only remaining fields (`autoRun`, provider selections) are session concerns that the supervisor session should accept as startup params, not a separate config type.

---

### [x] 4. `AgentProvider` — `utils/test-run-config.ts:5`

```ts
export type AgentProvider = "claude" | "codex" | "cursor";
```

A CLI-invented type that should be a shared branded literal union since both CLI and supervisor need to reference agent backends.

**Used in**: `use-flow-session.ts`, `use-preferences.ts`, `modeline.tsx`, `run-test.ts`, `index.tsx`

**Solution**: Define in `packages/shared/models` as `Schema.Literals(["claude", "codex", "cursor"])` or similar. Both supervisor and CLI import from there.

---

### [x] 5. `HealthcheckResult` — `utils/run-healthcheck.ts:6-9`

```ts
interface HealthcheckResult {
  shouldTest: boolean;
  scope: string;
}
```

Not a domain model. The entire healthcheck feature is a stub — `runHealthcheckHeadless` outputs a hardcoded JSON blob with `hasUntestedChanges: false`, `isGitRepo: false` (all lies, no actual checking). `runHealthcheckInteractive` prints "Healthcheck is not available" and asks "Run tests anyway?" with scope hardcoded to `"changes"`. The real version of this already exists: `UntestedChangesBanner` in the TUI reads `GitState` and checks `hasChangesFromMain || hasUnstagedChanges`.

**Solution**: Delete the entire healthcheck command and both functions. If a headless "should I test?" check is needed later, it's just `Git.getState()` — no invented types required.

---

### [x] 6. `FetchTestContextsResult` — `utils/context-options.ts:119-122`

```ts
export interface FetchTestContextsResult {
  options: TestContext[];
  isLoading: boolean;
}
```

Unused (no references found) but exported.

**Solution**: Remove.

---

### [x] 7. `CommanderGlobalOptions` — `utils/test-run-config.ts:32-43`

```ts
interface CommanderGlobalOptions {
  message?: string;
  flow?: string;
  yes?: boolean;
  planner?: AgentProvider;
  executor?: AgentProvider;
  planningModel?: string;
  executionModel?: string;
  baseUrl?: string;
  headed?: boolean;
  cookies?: boolean;
}
```

CLI-specific argument bag. Acceptable as a CLI-only type but currently used to construct the invented `TestRunConfig` which then requires further mapping.

**Solution**: Parse commander options directly into domain types at the CLI boundary. No intermediate `TestRunConfig`.

---

## Business Logic in React Components

### [x] 8. `TestingScreen` — execution orchestration — `screens/testing-screen.tsx:90-162`

The component runs the entire test execution lifecycle inside `useEffect`:

- Creates `ExecutedTestPlan` initial state
- Forks an Effect fiber that runs `Executor.executePlan`
- Streams execution events and updates local state
- Extracts screenshot paths from `ToolResult` events
- Invokes `Reporter.report` when done
- Manages fiber cleanup on unmount

```ts
runFiberRef.current = CliRuntime.runFork(
  Effect.gen(function* () {
    const executor = yield* Executor;
    const executionStream = (yield* executor.executePlan(testPlan)) as Stream.Stream<ExecutedTestPlan>;
    const finalExecuted = yield* executionStream.pipe(
      Stream.tap((executed) => Effect.sync(() => {
        // screenshot extraction, step timing, state updates
      })),
      Stream.runLast, ...
    );
    const report = yield* Reporter.use((reporter) => reporter.report(finalExecuted))...
    completeTestingRun(report);
  }).pipe(Effect.provide(Executor.layer), Effect.provide(Agent.layerFor(agentBackend)), ...)
);
```

**Solution**: Rewrite using effect-atom. The atom handles the Effect lifecycle — running finalizers, interrupting on unmount, scope management — so the component doesn't manually fork fibers, hold refs, or clean up. State updates and UI state still go through Zustand; effect-atom is only for lifecycle, not state management.

---

### [x] 9. `TestingScreen` — step status derivation — `screens/testing-screen.tsx:212-257`

```ts
const activeStepId = useMemo(() => {
  if (!executedPlan) return null;
  let activeId: string | null = null;
  for (const event of executedPlan.events) {
    if (event._tag === "StepStarted") activeId = event.stepId;
    if (
      (event._tag === "StepCompleted" || event._tag === "StepFailed") &&
      activeId === event.stepId
    ) {
      activeId = null;
    }
  }
  return activeId;
}, [executedPlan]);
```

And the step status/label derivation (lines 243-257) that maps plan steps + report steps + active state into display objects.

**Solution**: Add a `status` field to `TestPlanStep` itself (e.g. `"pending" | "active" | "passed" | "failed"`). Then step status becomes `executedPlan.steps[n].status` — no derivation needed.

Update `ExecutedTestPlan.addEvent` to be the single place where step state transitions happen. When a `StepStarted` event comes in, produce a new plan with that step's status set to `"active"`. When `StepCompleted` arrives, set it to `"passed"`. When `StepFailed`, set it to `"failed"`. All immutable:

```ts
addEvent(event: ExecutionEvent): ExecutedTestPlan {
  const updatedSteps = this.steps.map((step) => {
    if (event._tag === "StepStarted" && event.stepId === step.id)
      return new TestPlanStep({ ...step, status: "active" });
    if (event._tag === "StepCompleted" && event.stepId === step.id)
      return new TestPlanStep({ ...step, status: "passed", summary: event.summary });
    if (event._tag === "StepFailed" && event.stepId === step.id)
      return new TestPlanStep({ ...step, status: "failed", summary: event.message });
    return step;
  });
  return new ExecutedTestPlan({ ...this, steps: updatedSteps, events: [...this.events, event] });
}
```

This eliminates the `activeStepId` useMemo, the `reportStepsById` Map, and the entire step status derivation block in `TestingScreen`. The component just reads `step.status` directly.

---

### [x] 10. `TestingScreen` — tool call text extraction — `screens/testing-screen.tsx:227-236`

```ts
const currentToolCallText = useMemo(() => {
  const lastToolCall = executedPlan.events.findLast((event) => event._tag === "ToolCall");
  if (!lastToolCall || lastToolCall._tag !== "ToolCall") return null;
  const input = lastToolCall.input;
  if (input && typeof input === "object" && "command" in input) {
    return String((input as Record<string, unknown>).command).slice(0, 80);
  }
  return lastToolCall.toolName;
}, [executedPlan, toolCallDisplayMode]);
```

Parsing tool call inputs with fragile property checks and `as` casts. Violates "Prefer Schemas Over Fragile Property Checks".

**Solution**: Add a `displayText` getter on the `ToolCall` schema class. Usage becomes `executedPlan.events[n].displayText` — no fragile property checks or `as` casts in the component.

---

### [x] 11. `TestingScreen` — display name derivation — `screens/testing-screen.tsx:84-88`

```ts
const displayName = selectedCommit
  ? selectedCommit.shortHash
  : changesFor?._tag === "Branch" || changesFor?._tag === "Changes"
    ? (gitState?.currentBranch ?? "branch")
    : "working tree";
```

Same logic duplicated in `plan-review-screen.tsx:160-164`.

**Solution**: Add a `displayName` getter `ChangesFor` domain type.

---

### [x] 12. `usePlanningEffect` — planning orchestration — `app.tsx:26-136`

This hook shouldn't exist. It's the CLI doing the supervisor's job. The flow is: user submits instruction → store sets screen to `"planning"` → this effect fires because screen changed → it manually stitches together `Git.getState()` → `ChangesFor` resolution → `TestPlanDraft` construction → `Planner.plan()` → store update. That's just "start a planning session" — one supervisor call.

What it does:

- Reads git state, resolves `ChangesFor` variant
- Translates supervisor `ChangesFor` → shared schema `ChangesFor` (lines 80-95)
- Constructs `TestPlanDraft`
- Invokes `Planner` service
- Updates flow session store on completion/failure

The worst part is the `ChangesFor` format translation:

```ts
const schemaChangesFor =
  resolvedChangesFor._tag === "WorkingTree"
    ? { _tag: "WorkingTree" as const }
    : resolvedChangesFor._tag === "Branch"
      ? { _tag: "Branch" as const, branchName: currentBranch, base: mainBranch }
      : resolvedChangesFor._tag === "Changes"
        ? { _tag: "Branch" as const, branchName: currentBranch, base: mainBranch }
        : { _tag: "Commit" as const, hash: resolvedChangesFor.hash };
```

**Solution**: Delete the `useEffect`. This hook jams two unrelated things together: (1) building a `TestPlanDraft` from git state, and (2) calling `Planner.plan(draft)`. Those are separate operations. Split them:

- An effect-atom that constructs the `TestPlanDraft` (calls `Git.getFileStats()`, `Git.getDiffPreview()`, assembles the draft). That's it — one thing.
- Planning is a separate step, triggered when the draft is ready and the user confirms.

All supervisor services already exist. No new supervisor code needed. Also: consolidate `ChangesFor` types (see root cause above) so there's no translation step.

---

### [x] 13. `MainMenu` — submit handler — `screens/main-menu-screen.tsx:132-166`

```ts
const submit = useCallback((submittedValue?: string) => {
  // ... validation ...
  if (context?.branchName && context.type !== "changes") {
    switchBranch(context.branchName, context.prNumber ?? null);
  }
  if (context?.type === "commit" && context.commitHash) {
    const commit = { hash: context.commitHash, shortHash: context.commitShortHash ?? "", subject: context.commitSubject ?? "" };
    useFlowSessionStore.setState({ selectedCommit: commit });
    selectChangesFor(ChangesFor.Commit({ hash: context.commitHash }));
  } else {
    const mainBranch = gitState?.mainBranch ?? "main";
    selectChangesFor(
      context?.type === "branch" || context?.type === "pr"
        ? ChangesFor.Branch({ mainBranch })
        : ChangesFor.Changes({ mainBranch }),
    );
  }
  submitFlowInstruction(trimmed);
}, ...);
```

Business logic: does branch checkout (`switchBranch`), reconstructs a `CommitSummary` from loose `TestContext` fields, decides `ChangesFor` variant based on context type. None of this belongs in a submit handler.

**Solution**: Once `TestContext` is replaced with `TestContext`, most of this disappears — `TestContext.Commit` already carries `hash`/`shortHash`/`subject`, `TestContext.Branch` already carries the `RemoteBranch`. The submit handler becomes: pass the `TestContext` + instruction to the store. Branch checkout uses the existing `checkoutBranch` from supervisor (already imported). `ChangesFor` resolution is not the component's job — the supervisor resolves it from the `TestContext` when building the `TestPlanDraft`.

---

### [x] 13b. `MainMenu` — ref-mirroring anti-pattern — `screens/main-menu-screen.tsx:168-173`

```ts
const valueRef = useRef(value);
valueRef.current = value;
const pickerOpenRef = useRef(pickerOpen);
pickerOpenRef.current = pickerOpen;
const errorMessageRef = useRef(errorMessage);
errorMessageRef.current = errorMessage;
```

Three refs manually kept in sync with state to avoid stale closures in `handleInputChange`. This is a React anti-pattern — it exists because `handleInputChange` uses `useCallback` with an empty-ish dep array and needs current values.

**Solution**: Once the `@`-picker logic is extracted into a shared hook (see item 16a), this goes away. The hook manages its own state internally without leaking refs to the consumer.

---

### [x] 13c. `MainMenu` — `handleInputChange` with `@` picker detection — `screens/main-menu-screen.tsx:175-213`

```ts
const handleInputChange = useCallback((nextValue: string) => {
  const stripped = stripMouseSequences(nextValue);
  const previousValue = valueRef.current;
  if (stripped[stripped.length - 1] === "@" && ...) {
    setValue(stripped.slice(0, -1));
    openPicker();
    return;
  }
  if (pickerOpenRef.current) {
    // character-by-character analysis of what was typed
    // decides whether to update picker query or close picker
  }
  setValue(stripped);
}, [openPicker, closePicker]);
```

Character-by-character input analysis to detect `@` mentions and route keystrokes to the picker query. Duplicated verbatim in `plan-review-screen.tsx:120-156`.

**Solution**: Extract into the shared `@`-picker hook alongside item 16a. One implementation, used by both screens.

---

### [x] 13d. `MainMenu` — `useInput` handler mixes concerns — `screens/main-menu-screen.tsx:219-249`

One `useInput` block handling: tab to accept suggestion, shift+tab to toggle skip-planning, left/right arrows to cycle suggestions, and `g` to call the dead `requestSuggestions` callback. Mixes suggestion cycling, preference toggling, and dead code in one handler.

**Solution**: Remove the `g` keybind (dead code, see item 30). The rest is UI logic — fine once cleaned up.

---

### [x] 14. `MainMenu` — context option loading — `screens/main-menu-screen.tsx:51-79`

Two `useEffect` blocks with manual promise handling, cancelled flags, and loading state.

- `buildLocalTestContexts(gitState)` — calls `Github.findPullRequest` (to check if current branch has a PR), `Git.getRecentCommits` (to list commits), then maps everything into `TestContext` bags.
- `fetchRemoteTestContexts(gitState)` — calls `Github.listPullRequests` to get all remote branches, maps into PR/branch `TestContext` bags.

Both are data fetching + mapping into the invented `TestContext` type. The component reimplements what React Query does (cancellation, loading state, caching).

**Solution**: Create React Query hooks that fetch the domain models directly — `useRemoteBranches()` wrapping `Github.listPullRequests`, `useRecentCommits()` wrapping `Git.getRecentCommits`. The component constructs `TestContext` variants from these. No manual effect lifecycle, no cancelled flags, no `TestContext` mapping layer.

---

### [x] 15. `PlanReviewScreen` — duplicated context picker — `screens/plan-review-screen.tsx:65-156`

The entire context picker logic (open/close/search/select, local/remote options loading, filtered options) is copy-pasted from `main-menu-screen.tsx`.

**Solution**: Extract into a shared hook or component. But more importantly, context option loading should not be in components at all.

---

### [x] 16. `PlanReviewScreen` — the whole thing is a disaster — `screens/plan-review-screen.tsx`

This component is ~540 lines and is packed with tech debt. Breaking it all down:

#### [x] 16a. Duplicated context picker logic (lines 65-156)

The entire `@`-picker — open/close/search/select, local/remote option loading with manual `useEffect` + cancelled flags, `buildLocalContextOptions`, `fetchRemoteContextOptions`, `filterContextOptions`, `handleInputChange` with `@` detection — is copy-pasted verbatim from `main-menu-screen.tsx`.

**Solution**: Extract a shared `useTestContextPicker()` hook. Or better — once the React Query hooks (`useRemoteBranches`, `useRecentCommits`) exist, the picker just filters their data. No duplicated fetch logic.

#### [x] 16b. Inline type definitions (lines 171-175)

```ts
type RailSection = "info" | "steps";
type RailItem =
  | { kind: "details"; section: RailSection }
  | { kind: "step"; stepIndex: number; section: RailSection };
```

Types defined inside the component body. `RailItem` is a UI layout model — this is fine as a local type but should be extracted to the top of the file, not inlined after the hooks.

**Solution**: Move to top of file. These are legitimate UI types, not domain models.

#### [x] 16c. Dead code: `editingAssumptions` (line 169)

```ts
const editingAssumptions = false;
```

Always `false`, never changes. The JSX still references it for conditional rendering. Dead feature.

**Solution**: Remove `editingAssumptions` and all code that references it (the `AssumptionsEditingState` type, the assumptions editing UI).

#### [x] 16d. Plan editing with manual immutable construction (lines 204-214)

```ts
updatePlan(
  new TestPlan({
    ...plan,
    steps: plan.steps.map((step, index) =>
      index === editingStepIndex
        ? new TestPlanStep({ ...step, instruction: editingValue.trim() })
        : step,
    ),
  }),
);
```

Manually constructing new `TestPlan` and `TestPlanStep` instances in a keypress handler.

**Solution**: Use the `update()` method on the domain model. `TestPlanStep` gets `step.update({ instruction: editingValue.trim() })`. `TestPlan` (which extends `TestPlanDraft`) inherits `draft.update(...)` for top-level fields and gets `plan.updateStep(index, step.update({ instruction }))` for step-level changes. The component just calls `updatePlan(plan.updateStep(index, step.update({ instruction: value })))`.

#### [x] 16e. Hardcoded dead feature: flow saving (line 278)

```ts
if (input === "s") {
  setSaveError("Flow saving is not available.");
}
```

Save shortcut that always errors with a hardcoded message. This was a real feature on `main` (called `saveFlow` with the plan and environment) — it was gutted during the supervisor refactor on this branch.

**Solution**: Re-implement flow saving properly. The save operation should be a React Query mutation that persists the `TestPlanDraft` / `TestPlan` to disk. Not a priority for this migration but should not stay as a hardcoded error string.

#### [x] 16f. `displayName` derivation (lines 160-164)

```ts
const displayName = selectedCommit
  ? selectedCommit.shortHash
  : changesFor?._tag === "Branch" || changesFor?._tag === "Changes"
    ? (gitState?.currentBranch ?? "branch")
    : "working tree";
```

Duplicated from `testing-screen.tsx`.

**Solution**: Already covered in item 11 — use a getter on `ChangesFor`.

#### [x] 16g. Massive `useInput` handler (lines 197-284)

One `useInput` callback handling: editing state (escape/enter), resubmit confirmation (y/n), exit confirmation (y/n), keyboard navigation (j/k/arrows), focus management (shift+tab), step editing (e), save (s), and approve (a/enter). 90 lines of branching keyboard logic in one handler.

**Solution**: Split into focused handlers — one for editing mode, one for confirmation dialogs, one for navigation. Each with `{ isActive: ... }` guards.

#### [x] 16h. Second `useInput` for focus management (lines 286-313)

A separate `useInput` block that manages input/branch focus transitions (escape, tab, arrows, enter). Tightly coupled with the first `useInput` via shared state like `topFocus`, `resubmitConfirmVisible`.

**Solution**: Merge the focus management into the split handlers from 16g. Two `useInput` blocks sharing mutable state is fragile.

#### [x] 16i. `handleInputSubmit` with resubmit confirmation (lines 315-323)

```ts
const handleInputSubmit = () => {
  const trimmed = inputValue.trim();
  if (!trimmed || trimmed === flowInstruction) {
    setTopFocus(null);
    setInputValue(flowInstruction);
    return;
  }
  setResubmitConfirmVisible(true);
};
```

Determines whether to show a "re-generate plan?" confirmation based on whether the instruction changed. This is screen-level UI logic, not domain logic — acceptable but tangled with everything else.

**Solution**: Fine as UI logic, just needs to be untangled from the rest once the component is cleaned up.

---

### [x] 17. `ResultsScreen` — PR comment posting — `screens/results-screen.tsx:31-47`

```ts
const handlePostPullRequestComment = () => {
  // ...
  Effect.runPromise(
    Github.use((github) => github.addComment(process.cwd(), pullRequest, body)).pipe(
      Effect.provide(Github.layer),
    ) as Effect.Effect<void>,
  )
    .then(() => setCommentStatusMessage("Comment posted to PR."))
    .catch(() => setCommentStatusMessage("Failed to post PR comment."));
};
```

Direct `Effect.runPromise` call to a supervisor service inside a React click handler.

**Solution**: Use a React Query mutation. The mutation calls `Github.addComment` — React Query handles loading/error/success state. No manual `Effect.runPromise`, no `.then`/`.catch` chains, no local `isPostingComment`/`commentStatusMessage` state.

---

### [x] 18. `ResultsScreen` — report formatting — `screens/results-screen.tsx:13-21`

```ts
const buildResultsClipboardText = (report: TestReport): string => {
  const clipboardLines = [`Status: ${report.status}`, `Summary: ${report.summary}`];
  report.steps.forEach((step) => {
    clipboardLines.push(`${step.status.toUpperCase()} ${step.title}: ${step.summary}`);
  });
  return clipboardLines.join("\n");
};
```

Domain formatting logic.

**Solution**: Add a `get toPlainText()` getter on `TestReport` in shared/models.

---

### [x] 19. `PrPickerScreen` — branch filtering/sorting — `screens/pr-picker-screen.tsx:63-83`

```ts
const filteredBranches = (() => {
  let result = remoteBranches.filter((branch) => {
    if (activeFilter === "recent" || activeFilter === "all") return true;
    if (activeFilter === "no-pr") return branch.prStatus === null;
    return branch.prStatus === activeFilter;
  });
  if (searchQuery) {
    /* ... */
  }
  if (activeFilter === "recent") {
    result = result
      .filter((b) => b.updatedAt !== null)
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
  }
  return result;
})();
```

Query/filter/sort logic for remote branches inside a component render. Also `PrFilter` and `PR_FILTERS` are defined locally in the component — these are domain concepts (branch filter modes), not UI types.

**Solution**: Define `BranchFilter` (the `"recent" | "all" | "open" | "draft" | "merged" | "no-pr"` literal union) and the filter list in `packages/shared/models`. Add an `Order` on `RemoteBranch` using `Order.combine` to compose multiple orders — the first order handles the selected filter (optional), then falls back to default ordering (e.g. by `updatedAt`, then by name). The component just does `branches.sort(RemoteBranch.order(selectedFilter))`. Filtering by `prStatus` and search query also moves to `RemoteBranch` as a static method.

---

### [x] 20. `CookieSyncConfirmScreen` — environment mutation — `screens/cookie-sync-confirm-screen.tsx:43-52`

```ts
const activateOption = (option: ConfirmOption) => {
  if (option.id === "enable-sync") {
    updateEnvironment({ ...(environment ?? {}), cookies: true });
  }
  approvePlan();
};
```

Mutates a separate `browserEnvironment` bag instead of updating the actual domain model.

**Solution**: Just update `requiresCookies` on the `TestPlanDraft` directly. The draft already has this field. Add an `update(fields)` method on `TestPlanDraft` that returns a new immutable instance: `draft.update({ requiresCookies: true })`. Readable, descriptive, no spread-and-reconstruct at every call site.

---

### [x] 21. `Modeline` — provider name resolution and action callbacks — `ui/modeline.tsx:49-66`

```ts
case "planning": {
  const provider = resolvedPlanningProvider ?? planningProvider;
  const providerName = provider === "claude" ? "Claude"
    : provider === "codex" ? "Codex"
    : provider === "cursor" ? "Cursor" : null;
  // ...
}
```

The provider name resolution should be a property on the `AgentProvider` domain type.

The cookie-sync-confirm case (lines 83-106) embeds environment mutation:

```ts
onClick: () => {
  updateEnvironment({ ...(browserEnvironment ?? {}), cookies: true });
  approvePlan();
},
```

**Solution**: Same as item 20 — use `draft.update({ requiresCookies: true })` on the `TestPlanDraft`. No separate `browserEnvironment` bag to mutate.

---

### [x] 22. `UntestedChangesBanner` — derived state computation — `ui/untested-changes-banner.tsx:13-18`

```ts
const hasUntestedChanges = gitState.hasChangesFromMain || gitState.hasUnstagedChanges;
const fileCount = gitState.fileStats.length;
const changedLines = gitState.fileStats.reduce((sum, stat) => sum + stat.added + stat.removed, 0);
```

**Solution**: `GitState` should expose `hasUntestedChanges` and `totalChangedLines` as computed getters on the schema class.

---

### [x] 23. `FlowSessionStore` — state machine orchestration — `stores/use-flow-session.ts:97-267`

The entire store is a state machine with domain transitions:

- `submitFlowInstruction` — decides screen based on `skipPlanning`, resolves `needsCookieConfirmation`
- `completePlanning` — decides screen based on `autoRunAfterPlanning`
- `goBack` — complex screen-dependent back navigation with domain state resets
- `switchBranch` — calls `checkoutBranch()` (synchronous git exec), resets state, invalidates queries

**Solution**: Extract a `FlowSession` service in supervisor that manages the domain state machine. The zustand store becomes a thin React adapter that subscribes to the service's state stream.

---

### [x] 24. `extract-screenshot-path.ts` — event parsing — `utils/extract-screenshot-path.ts:13-21`

```ts
export const extractScreenshotPath = (
  event: Extract<UpdateContent, { _tag: "ToolResult" }>,
): string | null => {
  if (event.isError) return null;
  if (!SCREENSHOT_TOOL_NAMES.has(event.toolName)) return null;
  const match = SAVED_TO_PATTERN.exec(event.result);
  return match?.[1] ?? null;
};
```

Parses tool result strings to extract file paths. Domain logic about tool output formats.

**Solution**: Move to supervisor's executor or reporter. Screenshot path extraction should happen at the domain level, not in the CLI.

---

### [x] 25. `run-test.ts` — headless execution orchestration — `utils/run-test.ts:32-167`

The entire `runTest` function is the headless equivalent of what the TUI does:

- Resolves `ChangesFor` from action type (3rd copy of this logic)
- Creates `TestPlanDraft`
- Runs planner
- Runs executor stream
- Prints results

**Solution**: Move to a `runSession` function in supervisor that takes config and returns results. The CLI just calls it and prints.

---

### [x] 26. `index.tsx` — `resolveChangesFor` — `index.tsx:95-118`

Third copy of the action → `ChangesFor` mapping:

```ts
if (config.action === "commit" && config.commitHash) {
  return {
    changesFor: ChangesFor.Commit({ hash: config.commitHash }),
    selectedCommit: commit ?? undefined,
  };
}
if (config.action === "branch") {
  return { changesFor: ChangesFor.Branch({ mainBranch }), selectedCommit: undefined };
}
```

**Solution**: Deduplicate. This mapping should happen once, in the supervisor or at the CLI argument parsing boundary.

---

### [x] 27. `index.tsx` — `seedStoreFromConfig` — `index.tsx:120-140`

Seeds three separate zustand stores from `TestRunConfig`:

```ts
useNavigationStore.setState({ screen });
usePreferencesStore.setState({ autoRunAfterPlanning, skipPlanning, ... });
useFlowSessionStore.setState({ changesFor, selectedCommit, flowInstruction, ... });
```

**Solution**: Once there's a proper supervisor `FlowSession` service, initialization becomes `session.start(config)` and the stores subscribe to service state.

---

### [x] 28. `use-flow-session.ts` — `needsCookieConfirmation` stubbed to `false` — `stores/use-flow-session.ts:65`

```ts
const needsCookieConfirmation = (): boolean => false;
```

Always returns `false`, making the entire `CookieSyncConfirmScreen` unreachable. On `main` this was a real function that checked `plan?.cookieSync.required && environment?.cookies !== true`. It was gutted during the supervisor refactor.

**Solution**: Re-implement using the `TestPlanDraft.requiresCookies` field. If `requiresCookies` is true and cookies aren't enabled, show the confirmation. Or remove the cookie confirmation screen entirely and always sync cookies when `requiresCookies` is true.

---

### [x] 29. `MainMenu` — 13 `useState` calls — `screens/main-menu-screen.tsx:37-49`

```ts
const [value, setValue] = useState(flowInstruction);
const [inputKey, setInputKey] = useState(0);
const [suggestionIndex, setSuggestionIndex] = useState(0);
const [hasCycled, setHasCycled] = useState(false);
const [errorMessage, setErrorMessage] = useState<string | null>(null);
const [focus, setFocus] = useState<FocusArea>("input");
const [pickerOpen, setPickerOpen] = useState(false);
const [pickerQuery, setPickerQuery] = useState("");
const [pickerIndex, setPickerIndex] = useState(0);
const [remoteOptions, setRemoteOptions] = useState<ContextOption[]>([]);
const [localOptions, setLocalOptions] = useState<ContextOption[]>([]);
const [remoteLoading, setRemoteLoading] = useState(false);
```

12 useState calls in one component. 6 of them (`pickerOpen`, `pickerQuery`, `pickerIndex`, `remoteOptions`, `localOptions`, `remoteLoading`) belong to the picker logic and disappear once it's extracted into a hook. `inputKey` (line 38) is a hack to force re-mount the Input component by incrementing a key.

**Solution**: Extract picker state into shared hook (item 16a). Convert data fetching to React Query hooks (item 14). `inputKey` hack needs investigation — may indicate a bug in the Input component.

---

### [x] 30. `TestingScreen` — execution state tracked in 10 `useState` calls — `screens/testing-screen.tsx:51-61`

```ts
const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | null>(null);
const [stepStartTimesMs, setStepStartTimesMs] = useState<Map<string, number>>(new Map());
const [running, setRunning] = useState(true);
const [error, setError] = useState<string | null>(null);
const [screenshotPaths, setScreenshotPaths] = useState<string[]>([]);
const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
const [toolCallDisplayMode, setToolCallDisplayMode] = useState(TOOL_CALL_DISPLAY_MODE_COMPACT);
const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
const [exitRequested, setExitRequested] = useState(false);
const runFiberRef = useRef<Fiber.Fiber<unknown, unknown> | null>(null);
```

10 useState + 1 useRef for tracking execution. Most of this (`executedPlan`, `stepStartTimesMs`, `running`, `error`, `screenshotPaths`, `runStartedAt`, `runFiberRef`) is execution lifecycle state that should come from the effect-atom (item 8). Only `toolCallDisplayMode`, `showCancelConfirmation`, `exitRequested` are genuine UI state.

**Solution**: Once effect-atom handles execution (item 8), the atom exposes `executedPlan`, `running`, `error`. `screenshotPaths` comes from the `ExecutedTestPlan` getter. Timing should be modeled on the domain models — `ExecutedTestPlan` gets a `startedAt: DateTimeUtc`, `TestPlanStep` gets a `startedAt: Option<DateTimeUtc>`, and elapsed time is derived from those. No separate `Map<string, number>` or `runStartedAt` state. Component only keeps the 3 UI-only states (`toolCallDisplayMode`, `showCancelConfirmation`, `exitRequested`).

---

### [x] 31. `PrPickerScreen` — `confirmBranch` uses invented inline type — `screens/pr-picker-screen.tsx:37-40`

```ts
const [confirmBranch, setConfirmBranch] = useState<{
  name: string;
  prNumber: number | null;
} | null>(null);
```

Invented inline type instead of just holding a `RemoteBranch`.

**Solution**: Use `RemoteBranch | null` (or `Option<RemoteBranch>`). The branch already has `name` and `prNumber`.

---

### [x] 32. `PrPickerScreen` — business logic in selection handler — `screens/pr-picker-screen.tsx:131-143`

```ts
if (key.return) {
  const selected = filteredBranches[highlightedIndex];
  if (selected) {
    if (generatedPlan) {
      setConfirmBranch({ name: selected.name, prNumber: selected.prNumber });
    } else {
      clearCheckoutError();
      storeSwitchBranch(selected.name, selected.prNumber);
    }
  }
}
```

Checks `generatedPlan` to decide whether to show a confirmation dialog or switch directly. The component is making a domain decision: "does switching branches discard work?"

**Solution**: The store's `switchBranch` should handle this — if there's a plan, return a confirmation-needed signal. The component doesn't check `generatedPlan` directly.

---

### [x] 33. `index.tsx` — `resolveInitialScreen` — business logic — `index.tsx:90-93`

```ts
const resolveInitialScreen = (config: TestRunConfig): Screen => {
  if (config.message) return DEFAULT_SKIP_PLANNING ? "testing" : "planning";
  return "main";
};
```

Business logic deciding which screen to show based on config. Tightly coupled with `DEFAULT_SKIP_PLANNING` constant.

**Solution**: Once `TestRunConfig` is removed (item 3), the screen is determined by what the supervisor session state is — if there's already a draft with instruction, go to planning or testing. The navigation store derives the screen from session state, not from a config bag.

---

### [x] 34. `use-flow-session.ts` — `AssumptionsEditingState` type is dead — referenced from `plan-review-screen.tsx:27-29`

```ts
interface AssumptionsEditingState {
  kind: "assumptions";
}
type EditingState = StepEditingState | AssumptionsEditingState | null;
```

`AssumptionsEditingState` is part of the `EditingState` union but `editingAssumptions` is hardcoded to `false` (item 16c). The assumptions branch is never reached.

**Solution**: Remove `AssumptionsEditingState` from the union, simplify `EditingState` to `StepEditingState | null`.

---

### [x] 35. `PrPickerScreen` — manual useEffect data fetching (ANOTHER ONE) — `screens/pr-picker-screen.tsx:48-61`

```ts
useEffect(() => {
  let cancelled = false;
  fetchRemoteBranches(process.cwd())
    .then((branches) => {
      if (!cancelled) setRemoteBranches(branches);
    })
    .catch(() => {})
    .finally(() => {
      if (!cancelled) setIsLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, []);
```

Same pattern as `MainMenu` — manual promise lifecycle with cancelled flags instead of React Query. Also silently swallows errors with `.catch(() => {})`.

**Solution**: Use the `useRemoteBranches()` React Query hook (same one from item 14). Delete the manual effect.

---

### [x] 36. `TestingScreen` — `completedCount` / `runStatusLabel` derived in render — `screens/testing-screen.tsx:259-268`

```ts
const completedCount = steps.filter(
  (step) => step.status === "passed" || step.status === "failed",
).length;
const totalCount = steps.length;
const activeStep = steps.find((step) => step.status === "active");
const runStatusLabel = activeStep
  ? `Running ${activeStep.label}`
  : completedCount === totalCount
    ? "Finishing up"
    : "Starting";
```

Derived state computed in the render body. Once step status lives on `TestPlanStep` (item 9), `completedCount` and `activeStep` become getters on `ExecutedTestPlan`.

**Solution**: Add `completedCount` and `activeStep` getters on `ExecutedTestPlan`. `runStatusLabel` is display text — fine to keep in the component, but it should read from the getters.

---

### [x] 37. `MainMenu` — dead code: empty `requestSuggestions` — `screens/main-menu-screen.tsx:111`

```ts
const requestSuggestions = useCallback(() => {}, []);
```

Empty callback, does nothing. Still referenced in the `useInput` handler (pressing `g` calls it).

**Solution**: Remove the callback and the `g` keybind.

---

### [x] 38. Silent error swallowing across multiple components

`.catch(() => {})` appears in:

- `main-menu-screen.tsx:58` — `buildLocalContextOptions` error swallowed
- `main-menu-screen.tsx:72` — `fetchRemoteContextOptions` error swallowed
- `plan-review-screen.tsx:72,78` — same pattern duplicated
- `pr-picker-screen.tsx:54` — `fetchRemoteBranches` error swallowed

All violate the "Never Swallow Errors" rule from CLAUDE.md.

**Solution**: React Query handles error state automatically. Once these are converted to query hooks, error swallowing goes away. Errors surface as `query.error` for the component to display.

---

## `process.cwd()` Scattered Everywhere

Raw `process.cwd()` appears in:

- `utils/context-options.ts` (lines 33, 100, 136, 139)
- `utils/run-test.ts` (line 34)
- `app.tsx` (line 117)
- `index.tsx` (line 97)
- `stores/use-flow-session.ts` (line 246)
- `screens/pr-picker-screen.tsx` (line 50)
- `screens/results-screen.tsx` (line 40)

**Solution**: Resolve `cwd` once at startup, store it in a context or config. Or better: the supervisor services already handle `cwd` via `Git.withRepoRoot(cwd)` — the CLI shouldn't need to pass it repeatedly.

---

## `Effect.runPromise` / `Effect.runFork` Sprinkled in Components

Direct Effect runtime calls appear in:

- `app.tsx:52` — `Effect.runFork` for planning
- `testing-screen.tsx:110` — `CliRuntime.runFork` for execution
- `results-screen.tsx:39` — `Effect.runPromise` for PR comment
- `context-options.ts:36,101,136` — `Effect.runPromise` for git/github queries

**Solution**: All Effect execution should happen in the supervisor layer. The CLI should only interact with plain async functions or React Query hooks that wrap supervisor service calls.
