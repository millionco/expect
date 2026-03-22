# @browser-tester/shared

Shared constants, models, and services used across browser-tester packages.

## Install

```bash
pnpm add @browser-tester/shared
```

## Exports

### Main (`@browser-tester/shared`)

Constants and utilities for browser capacity estimation.

| Export                       | Kind     | Description                                     |
| ---------------------------- | -------- | ----------------------------------------------- |
| `BROWSER_MEMORY_OVERHEAD_MB` | Constant | Memory overhead per browser instance            |
| `DEFAULT_TIMEOUT_MS`         | Constant | Default operation timeout                       |
| `MEMORY_SAFETY_RATIO`        | Constant | Safety ratio for memory calculations            |
| `MS_PER_SECOND`              | Constant | Milliseconds per second                         |
| `estimateBrowserCapacity`    | Function | Estimate how many browsers can run concurrently |
| `getSystemStats`             | Function | Get current system memory and CPU stats         |
| `BrowserCapacity`            | Type     | Return type of `estimateBrowserCapacity`        |
| `SystemStats`                | Type     | Return type of `getSystemStats`                 |

### Models (`@browser-tester/shared/models`)

Domain models for test planning, execution, and git state.

#### Agent Providers

```ts
import { AgentProvider, AGENT_PROVIDER_DISPLAY_NAMES } from "@browser-tester/shared/models";
```

`AgentProvider` is a schema literal union: `claude` | `codex` | `cursor` | `gemini-cli` | `claude-code` | `codex-cli` | `cursor-acp` | `opencode` | `kiro-cli` | `copilot`

#### Git State

| Export                  | Kind     | Description                                  |
| ----------------------- | -------- | -------------------------------------------- |
| `GitState`              | Schema   | Current git state (branch, changes, remotes) |
| `FileStat`              | Schema   | File diff stats (path, added, removed)       |
| `Branch`                | Schema   | Branch name and metadata                     |
| `ChangesFor`            | Enum     | `WorkingTree` or `Branch` with base info     |
| `RemoteBranch`          | Schema   | Remote branch reference                      |
| `FileDiff`              | Schema   | File diff content                            |
| `GhPrListItem`          | Schema   | GitHub PR list entry                         |
| `BranchFilter`          | Schema   | Filter for branch listing                    |
| `formatFileStats`       | Function | Format file stats for display                |
| `changesForDisplayName` | Function | Display name for `ChangesFor` variant        |

#### Test Planning

| Export          | Kind   | Description                         |
| --------------- | ------ | ----------------------------------- |
| `TestPlan`      | Schema | Ordered list of test steps          |
| `TestPlanStep`  | Schema | Single step in a test plan          |
| `TestPlanDraft` | Schema | Draft test plan before finalization |
| `TestPlanJson`  | Schema | JSON-serializable test plan         |
| `PlanStepJson`  | Schema | JSON-serializable plan step         |
| `StepId`        | Schema | Branded step identifier             |
| `PlanId`        | Schema | Branded plan identifier             |
| `DraftId`       | Schema | Branded draft identifier            |
| `StepStatus`    | Schema | Step execution status               |

#### Execution Events

| Export           | Kind   | Description                   |
| ---------------- | ------ | ----------------------------- |
| `RunStarted`     | Schema | Run began                     |
| `StepStarted`    | Schema | Step began                    |
| `StepCompleted`  | Schema | Step succeeded                |
| `StepFailed`     | Schema | Step failed                   |
| `ToolCall`       | Schema | Agent tool invocation         |
| `ToolResult`     | Schema | Agent tool result             |
| `AgentThinking`  | Schema | Agent reasoning event         |
| `AgentText`      | Schema | Agent text output event       |
| `RunFinished`    | Schema | Run ended                     |
| `RunCompleted`   | Schema | Run fully completed           |
| `ExecutionEvent` | Type   | Union of all execution events |

#### Test Results

| Export             | Kind   | Description                              |
| ------------------ | ------ | ---------------------------------------- |
| `ExecutedTestPlan` | Schema | Test plan with execution events attached |
| `TestReport`       | Schema | Full test report with results            |
| `PullRequest`      | Schema | Pull request metadata                    |
| `Update`           | Schema | Incremental update during execution      |
| `UpdateContent`    | Type   | Union of update content types            |

#### Test Context

| Export                    | Kind     | Description                  |
| ------------------------- | -------- | ---------------------------- |
| `TestContext`             | Schema   | Context for test execution   |
| `testContextId`           | Function | Unique ID for a test context |
| `testContextFilterText`   | Function | Text for filtering contexts  |
| `testContextLabel`        | Function | Short label for display      |
| `testContextDescription`  | Function | Full description for display |
| `testContextDisplayLabel` | Function | Display-friendly label       |
| `FindPullRequestPayload`  | Schema   | Payload for PR lookup        |

#### Interfaces

| Export          | Description                          |
| --------------- | ------------------------------------ |
| `ChangedFile`   | File path and change status          |
| `CommitSummary` | Commit hash, short hash, and subject |

### Agent (`@browser-tester/shared/agent`)

Abstract agent service for streaming execution events.

```ts
import { Agent, AgentStreamOptions, AgentStreamError } from "@browser-tester/shared/agent";
```

| Export               | Kind    | Description                                           |
| -------------------- | ------- | ----------------------------------------------------- |
| `Agent`              | Service | Abstract service with `stream(options)` method        |
| `AgentStreamOptions` | Schema  | Options: `cwd`, `sessionId`, `prompt`, `systemPrompt` |
| `AgentStreamError`   | Error   | Agent streaming failure with provider and cause       |
