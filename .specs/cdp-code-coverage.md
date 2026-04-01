# CDP Runtime Code Coverage

Use Chrome DevTools Protocol code coverage to measure how thoroughly the agent tested changed code during a browser session. The agent checks coverage mid-session, finds untested functions, tests more, then closes.

## Problem

The agent tests code changes in a browser but has no signal for whether it actually exercised the relevant code paths. For complex multi-step interactions (nested dropdowns, form validation chains, error states), the agent often tests the happy path and calls it done. There's no feedback mechanism to say "you only triggered 3 of 8 handlers in this component."

The existing `TestCoverageReport` in `packages/shared/src/models.ts` is static — it tracks which files have test files on disk. This feature is runtime coverage: which JavaScript functions actually executed during the browser session.

## Design

Coverage starts transparently when the browser opens. The agent has a `code_coverage` MCP tool it calls before closing to check how thoroughly it tested the changed code. If coverage is low, the agent tests uncovered functions, then checks again.

```
Agent opens browser
  → CDP Profiler starts silently
  → Agent runs test steps
  → Agent calls code_coverage tool
  → Sees: "Dropdown.tsx 42% — uncovered: handleKeyboardNav, validateSubSelection"
  → Agent tests keyboard nav and sub-selection
  → Agent calls code_coverage again
  → Sees: "Dropdown.tsx 85%"
  → Agent calls close
```

Key property: `Profiler.takePreciseCoverage` is non-destructive — coverage keeps accumulating after each snapshot, so the agent can call the tool multiple times without resetting.

### What the agent sees

Only named functions are reported. Anonymous/arrow functions are filtered out because their names are not actionable.

```
Code coverage of changed files (named functions only):
  65% covered (13/20 named functions executed)

src/components/Dropdown.tsx — 42% (5/12 named functions)
  Uncovered: handleKeyboardNav, validateSubSelection, onErrorDismiss,
             renderNestedMenu, computePosition

src/utils/form-validator.ts — 50% (2/4 named functions)
  Uncovered: validateNestedField, sanitizeInput

src/pages/settings.tsx — 100% (4/4 named functions)
```

### Source map resolution

Changed file matching uses two strategies (try simple first, fall back to complex):

1. **URL path matching** — If a script URL ends with a changed file path (e.g., `http://localhost:5173/src/components/Dropdown.tsx` matches `src/components/Dropdown.tsx`), use directly. Handles Vite and other unbundled dev servers with zero overhead.

2. **Source map resolution** — For bundled scripts (Webpack, Next.js), fetch and parse the source map. Check if any of the source map's original sources match changed files. For matched sources, check if the source content contains the function name to attribute functions to files.

Uses `source-map-js` (pure JS, no WASM — same lib Vite and PostCSS use internally).

### Filtering to changed files

The executor already has `changedFiles` from git. Pass the file paths to the MCP server via a new `EXPECT_CHANGED_FILES` env var (JSON-encoded string array). Only functions mapping to these files appear in the report.

## Implementation

### New file: `packages/browser/src/cdp-coverage.ts`

Core module with lifecycle functions and source map resolver. Not an Effect service — effectful functions operating on a `CoverageHandle` value object.

```ts
interface ScriptInfo {
  readonly scriptId: string;
  readonly url: string;
  readonly sourceMapURL: string | undefined;
}

interface CoverageHandle {
  readonly cdpSession: CDPSession;
  readonly scripts: Map<string, ScriptInfo>;
}

interface CoverageReport {
  readonly entries: readonly FileCoverageEntry[];
  readonly overallPercent: number;
  readonly totalNamedFunctions: number;
  readonly coveredNamedFunctions: number;
}

interface FileCoverageEntry {
  readonly path: string;
  readonly totalNamedFunctions: number;
  readonly coveredNamedFunctions: number;
  readonly uncoveredFunctionNames: readonly string[];
  readonly coveragePercent: number;
}
```

Three lifecycle functions:

- **`startCoverage(page)`** — Creates CDP session via `context.newCDPSession(page)`. Enables `Debugger` (to collect `scriptParsed` events with source map URLs) and `Profiler`. Starts precise coverage with `callCount: true, detailed: false` (function-level, not block-level — lower overhead).

- **`takeCoverageSnapshot(handle, changedFiles)`** — Calls `Profiler.takePreciseCoverage` (non-destructive). For each script: try URL path matching first, then source map resolution. Filters to changed files. Returns `CoverageReport`.

- **`stopCoverage(handle)`** — Stops profiler, disables debugger, detaches CDP session. Each step wrapped in `catchCause` for graceful cleanup.

Plus a pure formatter:

- **`formatCoverageReport(report)`** — Renders the report as text for MCP tool output.

### Changes to `packages/browser/src/mcp/mcp-session.ts`

`BrowserSessionData` gets a new field:

```ts
interface BrowserSessionData {
  // ... existing fields ...
  readonly coverageHandle: CoverageHandle | undefined;
}
```

**In `open()`** — After `setupPageTracking` and rrweb setup, start coverage:

```ts
const coverageHandle = yield* startCoverage(pageResult.page).pipe(
  Effect.catchCause((cause) =>
    Effect.logDebug("CDP coverage failed to start", { cause }).pipe(
      Effect.as(undefined),
    ),
  ),
);
```

**New `getCoverageReport()` method** — Called by the MCP tool:

```ts
const getCoverageReport = Effect.fn("McpSession.getCoverageReport")(function* () {
  const session = yield* requireSession();
  if (!session.coverageHandle) return undefined;
  return yield* takeCoverageSnapshot(session.coverageHandle, changedFilePaths);
});
```

**In `close()`** — Stop coverage before browser close:

```ts
if (activeSession.coverageHandle) {
  yield* stopCoverage(activeSession.coverageHandle).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("CDP coverage failed to stop", { cause }),
    ),
  );
}
```

Expose `getCoverageReport` in the returned `{ ... } as const` object.

### Changes to `packages/browser/src/mcp/constants.ts`

```ts
export const EXPECT_CHANGED_FILES_ENV_NAME = "EXPECT_CHANGED_FILES";
```

Export from `packages/browser/src/mcp/index.ts`.

### Changes to `packages/browser/src/mcp/server.ts`

Register the `code_coverage` tool:

```ts
server.registerTool(
  "code_coverage",
  {
    title: "Code Coverage",
    description:
      "Check JavaScript code coverage of changed files. Shows which named functions were executed during the browser session. Call before closing to verify test thoroughness.",
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  () =>
    runMcp(
      Effect.gen(function* () {
        const session = yield* McpSession;
        const report = yield* session.getCoverageReport();
        if (!report) return textResult("Code coverage not available.");
        return textResult(formatCoverageReport(report));
      }).pipe(Effect.withSpan("mcp.tool.code_coverage")),
    ),
);
```

Include a final coverage summary in the `close` tool output:

```ts
if (result.coverageSummary) {
  lines.push("");
  lines.push(result.coverageSummary);
}
```

### Changes to `packages/supervisor/src/executor.ts`

Pass changed file paths to MCP env:

```ts
if (context.changedFiles.length > 0) {
  mcpEnv.push({
    name: EXPECT_CHANGED_FILES_ENV_NAME,
    value: JSON.stringify(context.changedFiles.map((file) => file.path)),
  });
}
```

Import `EXPECT_CHANGED_FILES_ENV_NAME` from `@expect/browser/mcp`.

### Changes to `packages/shared/src/prompts.ts`

Add `code_coverage` to the `<tools>` list:

```
"8. code_coverage: check JavaScript code coverage of changed files. Shows which named functions were and weren't executed.",
"9. close: close the browser and end the session.",
```

Add coverage check to `<run_completion>`:

```
"Before closing the browser, call `code_coverage` to check how thoroughly you tested the changed code.",
"Review any uncovered named functions. If uncovered functions represent user-facing behavior you haven't exercised (event handlers, validators, renderers, state transitions), add test steps targeting them, then re-check.",
"Skip functions that are clearly infrastructure (error boundaries, logging, dev-only code).",
```

## Tradeoffs and known limitations

**Anonymous functions** — Filtered out entirely. Modern React code is mostly arrow functions, so the coverage percentages reflect named functions only. The actual code coverage is lower than reported, but the reported data is actionable.

**Server components** — Next.js server components don't execute in the browser. They won't appear in the coverage report. The agent should not be misled into trying to trigger server-only code.

**Performance overhead** — Using `detailed: false` (function-level) keeps overhead at ~10-30% slowdown. Block-level (`detailed: true`) would be 30-50% and could cause flaky interactions.

**Source maps unavailable** — Falls back to URL-path matching. If neither works for a script, skip it silently.

**Multi-page navigations** — CDP session is per-page. If the agent navigates to a new origin, coverage from the first page is preserved in the snapshot but new-page scripts won't be tracked.

**No hard threshold** — The prompt does not specify a coverage percentage target. Instead, it tells the agent to review uncovered function names and use judgment about which represent user-facing behavior worth testing. Infrastructure functions (error boundaries, logging) should be skipped.

**Source map function attribution** — For bundled scripts, functions are attributed to a source file by checking if the source content contains the function name. This is a heuristic — if two files define a function with the same name, it could be misattributed. In practice, this is rare for meaningfully named functions.

## Dependencies

- `source-map-js` — Already used by Vite and PostCSS. Pure JS, no WASM. Add to `packages/browser/package.json`.
