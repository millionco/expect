# @browser-tester/supervisor

Test planning, execution, reporting, and git/GitHub integration for browser-tester.

## Install

```bash
pnpm add @browser-tester/supervisor
```

## Exports

### Services

#### `Planner`

Generates test plans from code changes using an agent backend. Streams agent output, parses the resulting plan, and validates it.

```ts
import { Planner } from "@browser-tester/supervisor";

const planner = yield * Planner;
const plan = yield * planner.plan(draft);
```

#### `Executor`

Executes a test plan by streaming agent interactions and accumulating execution events into an `ExecutedTestPlan`.

```ts
import { Executor } from "@browser-tester/supervisor";

const executor = yield * Executor;
const executedStream = yield * executor.executePlan(plan);
```

#### `Reporter`

Generates a `TestReport` from an executed test plan, summarizing pass/fail status and collecting screenshot paths.

```ts
import { Reporter } from "@browser-tester/supervisor";

const reporter = yield * Reporter;
const report = yield * reporter.report(executedPlan);
```

#### `Updates`

PubSub-based event bus for broadcasting execution updates in real time.

```ts
import { Updates } from "@browser-tester/supervisor";

const updates = yield * Updates;
yield * updates.publish(content);
const stream = yield * updates.stream();
```

#### `Git`

Git operations service for diffing, staging, committing, and branch management.

```ts
import { Git } from "@browser-tester/supervisor";

const git = yield * Git;
```

#### `Github`

GitHub CLI wrapper for pull request operations.

```ts
import { Github } from "@browser-tester/supervisor";

const github = yield * Github;
```

### Errors

| Error                | Description                          |
| -------------------- | ------------------------------------ |
| `PlanningError`      | Test plan generation failed          |
| `ExecutionError`     | Test plan execution failed           |
| `GitError`           | Git command failed                   |
| `FindRepoRootError`  | Could not locate git repository root |
| `GitHubCommandError` | GitHub CLI command failed            |

### Re-exports from `@browser-tester/shared/models`

Domain models re-exported for convenience:

`AgentProvider` `ChangesFor` `DraftId` `ExecutedTestPlan` `FileStat` `formatFileStats` `Git` `GitError` `GitRepoRoot` `GitState` `TestPlan` `TestPlanDraft` `TestPlanStep` `TestReport`

Types: `ChangedFile` `CommitSummary` `ExecutionEvent` `UpdateContent`

### Utilities

| Export                   | Kind     | Description                           |
| ------------------------ | -------- | ------------------------------------- |
| `checkoutBranch`         | Function | Check out a branch by name            |
| `getLocalBranches`       | Function | List local git branches               |
| `promptHistoryStorage`   | Function | Persistent storage for prompt history |
| `categorizeChangedFiles` | Function | Group changed files by category       |
| `formatFileCategories`   | Function | Format categorized files for display  |
| `ChangedFileSummary`     | Type     | Summary of a categorized file         |
| `FileCategory`           | Type     | File category identifier              |
