# Expect

## Project Overview

**Expect** is a CLI tool that lets coding agents (Claude Code, Codex CLI, Cursor) automatically test code changes in a real browser. The workflow:

1. User runs `expect` in their terminal
2. The tool scans unstaged git changes or a branch diff
3. An AI agent generates a test plan describing how to validate the changes
4. The user reviews and approves the plan in an interactive TUI
5. The agent executes the test plan against a live browser instance
6. Results are displayed with pass/fail status and session recordings

**Target:** Developers using terminal coding agents who want automated browser-based validation of their code changes.

**Core architecture:**

- **pnpm monorepo** — `expect-cli` (Ink TUI), `@expect/supervisor` (orchestration), `@expect/agent` (LLM backend), `@expect/browser` (Playwright automation), `@expect/cookies` (browser profile extraction), `@expect/shared` (domain models)
- **Supervisor** — Owns all state management, agent lifecycle, and git operations. The CLI is a stateless renderer of supervisor state.
- **Browser automation** — Playwright-based with MCP protocol support and rrweb session recording.
- **Cookie extraction** — Reads browser profile databases (Chrome, Firefox, Safari) so tests run with real authentication state.

**Tech stack:** Effect-TS, React + Ink (terminal UI), Playwright, TypeScript

See `.specs/` for implementation specs.

## Verify changes

```bash
pnpm check
```

## Code style

- `interface` over `type`. `Boolean` over `!!`. Arrow functions only.
- No comments unless it's a hack (`// HACK: reason`).
- No type casts (`as`) unless unavoidable.
- No unused code, no duplication.
- Descriptive variable names (no shorthands or 1-2 char names).
- kebab-case filenames.
- Magic numbers go in `constants.ts` as `SCREAMING_SNAKE_CASE` with unit suffixes (`_MS`, `_PX`).
- One focused utility per file in `utils/`.

## No Barrel Files

**Never create index.ts files that just re-export things.** The name `index.ts` lacks semantic meaning and adds unnecessary indirection. Import directly from the source file instead.

```ts
// GOOD - import directly from the source
import { Cookies } from "@expect/cookies/cookies";
import { TestPlan } from "@expect/shared/test-plan";

// BAD - don't create or use barrel files
// src/cookies/index.ts that just does: export * from "./cookies"
import { Cookies } from "@expect/cookies";
```

# Writing Effect Guide

**Code Examples**: For real-world Effect code patterns and implementation examples, search
the `.repos/effect` folder. This contains the Effect source code and is an excellent
reference for understanding how Effect APIs are used in practice. Use Grep/Glob to find
relevant snippets when you need to see how a specific function or pattern is implemented.

**Effect Atom**: For React integration patterns using Effect, refer to `.repos/effect/packages/atom/react` and `.repos/effect/packages/effect/src/unstable/reactivity/Atom.ts`.
This library provides reactive state management for React using Effect, with atoms and
hooks for building UI components that integrate cleanly with Effect services.

# Effect Rules

Effect v4 patterns for this codebase.

## Services — Use `ServiceMap.Service`

Never use `Effect.Service` or `Context.Tag`. Use `ServiceMap.Service` with `make:` property and explicit `static layer`.

```ts
import { Effect, Layer, ServiceMap } from "effect";

export class Cookies extends ServiceMap.Service<Cookies>()("@cookies/Cookies", {
  make: Effect.gen(function* () {
    const cdpClient = yield* CdpClient;

    const extract = Effect.fn("Cookies.extract")(function* (options: ExtractOptions) {
      yield* Effect.annotateCurrentSpan({ url: options.url });
      // ...
      return cookies;
    });

    return { extract } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(CdpClient.layer));
}
```

Key differences from `Effect.Service`:

- `make:` not `effect:`
- No `dependencies:` array — use `Layer.provide()` chaining on `static layer`
- No `accessors: true`
- `Layer.effect(this)(this.make)` for the layer

## Errors — Use `Schema.ErrorClass`

Use `Schema.ErrorClass` with explicit `_tag: Schema.tag(...)`. Define `message` as a class field derived from data, never as a schema field.

```ts
import { Schema } from "effect";

export class CookieDatabaseNotFoundError extends Schema.ErrorClass<CookieDatabaseNotFoundError>(
  "CookieDatabaseNotFoundError",
)({
  _tag: Schema.tag("CookieDatabaseNotFoundError"),
  browser: Schema.String,
}) {
  message = `Cookie database not found for ${this.browser}`;
}
```

Failing with an error — `.asEffect()` is not needed when using `return yield*`:

```ts
if (!databasePath) {
  return yield * new CookieDatabaseNotFoundError({ browser });
}
```

## Error Handling

Use `catchTag` / `catchTags` for specific errors. Never `catchAll` or `mapError`. Never `Effect.catch(...)` — always `Effect.catchTag("SpecificError", ...)`.

Infrastructure errors become defects:

```ts
Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die });
```

Domain errors get specific handling:

```ts
Effect.catchTag("NoSuchElementError", () =>
  new CookieDatabaseNotFoundError({ browser }).asEffect(),
);
```

### Narrow Catching with `Effect.catchReason`

Avoid broad catch statements. When an error type contains sub-errors (like `PlatformError` with `{ reason: <union> }`), use `Effect.catchReason` to catch only the specific sub-error:

```ts
// BAD — catches permission errors, disk errors, everything
fileSystem.readFileString(path).pipe(Effect.catch(() => Effect.succeed("")));

// GOOD — catches only NotFound
fileSystem
  .readFileString(path)
  .pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed("")));
```

### Never Swallow Errors

Banned patterns:

```ts
Effect.orElseSucceed(() => undefined);
Effect.catchAll(() => Effect.succeed(undefined));
Effect.option;
Effect.ignore();
```

Allowed — recover from specific, expected errors:

```ts
Effect.catchTag("CookieDatabaseNotFoundError", () => Effect.succeed([]));
```

### Unrecoverable Errors Must Defect

Errors that signal bugs in our software (e.g. `BinaryParseError`, `UnsupportedPlatformError`) are unrecoverable. Use `Effect.die` for these — never recover from them. If we silently recover, we hide bugs.

```ts
// BAD — hides a bug in binary parsing
Effect.catchTag("BinaryParseError", () => Effect.succeed([]));

// GOOD — let it crash, it's a bug
Effect.catchTag("BinaryParseError", Effect.die);
```

Reserve the error channel for recoverable, expected errors (e.g. `BrowserNotFoundError` — the user doesn't have that browser installed).

### Never use Effect.mapError — use Effect.catchTag instead

**Critical**: Almost never use `Effect.mapError`. It blindly maps ALL errors to a new error type, which destroys the error domain. If a schema decoding error or platform error happens, `mapError` would incorrectly turn it into e.g. "Browser not found".

**BAD — `Effect.mapError` blindly maps everything:**

```ts
// This turns SchemaError, PlatformError, AND NoSuchElementError all into
// BrowserNotFoundError — completely wrong for schema/platform errors
browserDetector
  .findBrowser(browserName)
  .pipe(Effect.mapError(() => new BrowserNotFoundError({ browserName })));
```

**GOOD — `Effect.catchTag` handles only the specific error:**

```ts
// Only catches NoSuchElementError, leaving SchemaError/PlatformError untouched
browserDetector.findBrowser(browserName).pipe(
  Effect.catchTag("NoSuchElementError", () =>
    new BrowserNotFoundError({
      browserName,
      message: `Browser not found: ${browserName}`,
    }).asEffect(),
  ),
);
```

**Pattern for services:** Use `catchTag` for domain errors, then `catchTags` to die on infrastructure errors:

```ts
const get = (browserName: string) =>
  browserDetector.findBrowser(browserName).pipe(
    Effect.catchTag("NoSuchElementError", () =>
      new BrowserNotFoundError({ browserName, message: `...` }).asEffect(),
    ),
    Effect.catchTags({ SchemaError: Effect.die }),
    Effect.withSpan("Browsers.get"),
  );
```

**Note:** Use `.asEffect()` on error classes instead of `Effect.fail(new Error(...))`.

### Model Missing Data as Errors

Only model the happy path on the success channel. Instead of returning empty/default values for missing data, model it as an error and let consumers decide how to handle it:

```ts
// BAD
if (!content) return EMPTY_PROFILE_METADATA;

// GOOD — let consumers catchTag if they want to recover
return yield * new ProfileMetadataNotFoundError({ browser });
```

## Functions — Use `Effect.fn`

Every effectful function uses `Effect.fn` with a descriptive span name:

```ts
const extractChromiumCookies = Effect.fn("extractChromiumCookies")(function* (
  browser: ChromiumBrowser,
  hosts: string[],
) {
  yield* Effect.annotateCurrentSpan({ browser });
  // ...
});
```

## Never Explicitly Type Return Types

Let TypeScript infer. Never annotate `: Effect.Effect<...>` on functions.

```ts
// BAD
const get = (id: string): Effect.Effect<Cookie[], CookieReadError> => ...

// GOOD
const get = (id: string) => Effect.gen(function* () { ... });
```

## Never Use Null

Use `Option` from Effect or `undefined`. Never `null`.

```ts
// BAD
return null;

// GOOD
return Option.none();
```

## Prefer `Effect.forEach` Over `Effect.all`

```ts
// BAD
yield * Effect.all(browsers.map((browser) => extractBrowser(browser)));

// GOOD
yield *
  Effect.forEach(browsers, (browser) => extractBrowser(browser), {
    concurrency: "unbounded",
  });
```

## Prefer Schemas Over Fragile Property Checks

Use `Schema.decodeEffect` instead of manual JSON parsing and property checks:

```ts
// BAD
const localState =
  yield *
  Effect.try({
    try: () => JSON.parse(content),
    catch: () => undefined,
  });
if (!isObjectRecord(localState)) return EMPTY_PROFILE_METADATA;
const profileState = localState["profile"];
if (!isObjectRecord(profileState)) return EMPTY_PROFILE_METADATA;

// GOOD
const profiles =
  yield *
  fileSystem
    .readFileString(localStatePath)
    .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ProfileSchema))));
return profiles;
```

Use `Predicate.isObject` instead of custom `isObjectRecord` type guards.

## Prefer `effect/Order` for Sorting

Composable sorting with `Order.combine`:

```ts
const byLastUsed = Order.mapInput(
  Order.Boolean,
  (profile: BrowserProfile) => profile.profileName === lastUsedProfileName,
);
const byProfileName = Order.mapInput(
  Order.make((left: string, right: string) => naturalCompare(left, right) as -1 | 0 | 1),
  (profile: BrowserProfile) => profile.profileName,
);
const byLastUsedThenName = Order.combine(byLastUsed, byProfileName);
profiles.sort(byLastUsedThenName);
```

## Retry — Use Object Syntax

```ts
// BAD
Effect.retry(Schedule.spaced("1 second").pipe(Schedule.compose(Schedule.recurs(CDP_RETRY_COUNT))));

// GOOD
Effect.retry({
  times: CDP_RETRY_COUNT,
  schedule: Schedule.spaced("1 second"),
});
```

## Scoped Resources

Use `fs.makeTempDirectoryScoped` instead of manual `addFinalizer` cleanup:

```ts
// BAD
const tempDir = yield * fileSystem.makeTempDirectory({ prefix: "cookies-cdp-" });
yield *
  Effect.addFinalizer(() =>
    fileSystem.remove(tempDir, { recursive: true }).pipe(Effect.catch(() => Effect.void)),
  );

// GOOD
const tempDir = yield * fileSystem.makeTempDirectoryScoped({ prefix: "cookies-cdp-" });
```

Use `fs.copy()` instead of custom recursive copy functions.

## Platform-Specific Logic in Layers

Never put all platform code in one `make`. Create separate layers per platform and inject them at runtime:

```ts
export class SqliteEngine extends ServiceMap.Service<
  SqliteEngine,
  {
    readonly open: (
      databasePath: string,
    ) => Effect.Effect<SqliteDatabase, CookieReadError, Scope.Scope>;
  }
>()("@cookies/SqliteEngine") {
  static layerBun = Layer.succeed(this, {
    open: (databasePath: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const { Database } = await import(BUN_SQLITE_MODULE);
            return new Database(databasePath, { readonly: true }) as SqliteDatabase;
          },
          catch: (cause) => new CookieReadError({ browser: "unknown", cause: String(cause) }),
        }),
        (database) => Effect.sync(() => database.close()),
      ),
  });

  static layerNodeJs = Layer.succeed(this, { ... });
  static layerLibSql = Layer.succeed(this, { ... });
}
```

For services like `BrowserDetector`, use `layerWindows`, `layerMac`, `layerLinux` and match on `platform` to select the correct one. Separate providers register themselves with a shared service (e.g. `Browsers.register(...)`), keeping each provider focused on single responsibility.

## Consolidate Schemas

Constrain the number of schemas. Avoid proliferating models like `BrowserProfile`, `BrowserInfo`, `ProfileMetadata`, `CdpRawCookie`. Consolidate into a small set (e.g. `Browser` and `Cookie`) so you always know what a function should return.

## Prefer Getters on Existing Domain Models

When you need derived/computed data from a domain model, add a getter to the existing schema class. Never invent a new wrapper type or compute derived state in the UI layer.

```ts
// BAD — computing derived state in a React component
const activeStepId = useMemo(() => {
  for (const event of executedPlan.events) { ... }
}, [executedPlan]);

// BAD — computing derived state in a utility function
const getActiveStepId = (plan: ExecutedTestPlan): string | null => { ... }

// BAD — inventing a new type to carry derived state
interface TestRunState { activeStepId: string | null; stepStatuses: ... }

// GOOD — getter on the domain model
export class ExecutedTestPlan extends TestPlan.extend<ExecutedTestPlan>(...)({
  events: Schema.Array(ExecutionEvent),
}) {
  get activeStepId(): StepId | undefined { ... }
  get completedCount(): number { ... }
}
```

## Structured Logging

Use `Effect.logInfo`, `Effect.logWarning`, `Effect.logDebug` with structured data:

```ts
yield *
  Effect.logInfo("Chromium cookies extracted", {
    browser,
    count: cookies.length,
  });
```

## Backend Logging Requirements

**When writing or modifying backend service code, always add appropriate logging.**

Rules:

- **Use Effect logging, never `console.log`** — All logging must go through `Effect.logInfo`, `Effect.logDebug`, `Effect.logWarning`, `Effect.logError`.
- **Log mutations at Info level** — Any create, update, delete, or commit operation should log what happened with relevant IDs.
- **Log high-frequency reads at Debug level** — Balance lookups, list queries, etc. use `Effect.logDebug` so they can be silenced in production.
- **Annotate spans with contextual IDs** — Use `yield* Effect.annotateCurrentSpan({ sessionId, browser })` etc. in service functions that already have spans.
- **Log in services, not in lower layers** — Add logging where business meaning lives (the service layer).
- **Never log sensitive data** — No passwords, tokens, or full request/response payloads. Log IDs and metadata only.

```ts
// Example: proper logging in a service function
const commitBlock = Effect.fn("Blocks.commitBlock")(function* (blockId: BlockId) {
  yield* Effect.annotateCurrentSpan({ blockId });
  const block = yield* blockRepo.findById(blockId);
  // ... business logic ...
  yield* Effect.logInfo("Block committed", {
    blockId,
    entryCount: entries.length,
  });
  return committedBlock;
});
```

## Avoid `try` / `catch`

Use `Effect.try` for sync and `Effect.tryPromise` for async:

```ts
const rows =
  yield *
  Effect.tryPromise({
    try: () => querySqlite(dbPath, sql),
    catch: (cause) => new CookieReadError({ browser, cause: String(cause) }),
  });
```

## Pure Functions Stay Pure

Functions with no I/O and no failure modes do not need Effect wrapping.

---

## Additional Rules

### Branded IDs

Every entity ID is branded for compile-time safety:

```ts
export const TaskId = Schema.String.pipe(Schema.brand("TaskId"));
export type TaskId = typeof TaskId.Type;
```

Use `Schema.String` as the base, not `Schema.UUID` — IDs may not always be UUIDs.

### Schema Type Selection

| Type                  | Use For                        | Has `_tag`?    |
| --------------------- | ------------------------------ | -------------- |
| `Model.Class`         | DB-backed entities             | No             |
| `Schema.TaggedClass`  | Domain events, union members   | Yes (auto)     |
| `Schema.Class`        | Value objects (no tag needed)  | Optional       |
| `Schema.ErrorClass`   | Errors                         | Yes (explicit) |
| `Schema.TaggedStruct` | Lightweight enum-like variants | Yes (auto)     |

Use `Model.GeneratedByApp`, `Model.DateTimeInsert`, `Model.DateTimeUpdate`, `Model.JsonFromString`, `Model.FieldOption` for DB entity fields.

### Error Naming

`{Entity}{Reason}Error` — e.g. `TaskNotFoundError`, `ProjectAlreadyExistsError`. One error per failure mode. Never collapse to a generic `NotFoundError`.

### Service Conventions

- Return `{ ... } as const` from `make` — explicit public API
- Yield dependencies at service construction time, not per-method
- For abstract services, define the interface in the class generic:

```ts
export class CodingAgent extends ServiceMap.Service<
  CodingAgent,
  {
    readonly sendMessage: (
      sessionId: SessionId,
      content: string,
    ) => Effect.Effect<void, AgentError>;
  }
>()("CodingAgent") {}
```

### Layer Composition

- `Layer.provide` for service dependency chains
- `Layer.provideMerge` for infrastructure stacks (DB, logging, config)
- `Layer.mergeAll` for composing sibling layers (e.g. RPC router groups)

### FiberMap for Concurrent Tasks

Use `FiberMap` when you need keyed concurrent fibers with auto-cancellation:

```ts
const running = yield * FiberMap.make<TaskId>();
yield * FiberMap.run(running, taskId, someEffect);
yield * FiberMap.remove(running, taskId);
```

Guard double-runs with `FiberMap.has`.

### Resource Lifecycle with `acquireRelease`

Pair resource acquisition with cleanup. Use `Effect.scoped` to define the scope boundary:

```ts
const terminal =
  yield *
  Effect.acquireRelease(
    Effect.try({
      try: () => pty.spawn(shell, [], { cwd, env }),
      catch: (cause) => new SpawnError({ cause }),
    }),
    (terminal) => Effect.sync(() => terminal.kill()),
  );
```

### PubSub for Event Broadcasting

Use `PubSub.unbounded<T>()` for in-process event streaming. Distinguish ephemeral events (transient UI state) from persisted events (durable state changes stored in DB).

### `Data.TaggedEnum` for Unions

```ts
export type ChangesFor = Data.TaggedEnum<{
  WorkingTree: {};
  Branch: { branchName: string; base: string };
}>;
export const ChangesFor = Data.taggedEnum<ChangesFor>();
```

### Environment Variables

Never use `process.env`. Use `Config.string` / `Config.integer` for validated config.

### Imports (Effect v4)

| Module      | Path                          |
| ----------- | ----------------------------- |
| Core        | `effect`                      |
| SQL         | `effect/unstable/sql`         |
| Process     | `effect/unstable/process`     |
| Persistence | `effect/unstable/persistence` |
| Model       | `effect/unstable/schema`      |
| FileSystem  | `effect/FileSystem`           |
| Platform    | `@effect/platform-node`       |

## Defining Domain Entities with Effect

All domain entities should be defined using `Schema`. For more information about `Schema`, use the `effect_docs_search` MCP tool.

## Testing Effect Code

Use `vitest` with the `@effect/vitest` package:

```ts
import { Effect } from "effect";
import { describe, it, assert } from "@effect/vitest";

describe("My Effect tests", () => {
  // Use `it.effect` to run Effect tests (provides Scope automatically)
  it.effect("should run an Effect and assert the result", () =>
    Effect.gen(function* () {
      const result = yield* effectToTest;
      assert.strictEqual(result, "Hello, World!");
    }),
  );

  it.effect("should handle errors in Effect", () =>
    Effect.gen(function* () {
      const errorEffect = Effect.fail("An error occurred");
      const error = yield* errorEffect.pipe(Effect.flip);
      assert.strictEqual(error, "An error occurred");
    }),
  );

  // Provide layers to tests
  it.effect("with dependencies", () =>
    Effect.gen(function* () {
      const service = yield* MyService;
      // ...
    }).pipe(Effect.provide(MyService.layer)),
  );
});
```

## Common Effect Modules

- `HttpApi` modules from `@effect/platform`: Write HTTP APIs using Effect & the `Schema` module.
- `HttpClient` modules from `@effect/platform`: Write HTTP clients using Effect.
- `@effect/sql` package: Write SQL queries using Effect
  - `@effect/sql-pg`: PostgreSQL
  - `@effect/sql-sqlite`: SQLite
  - `@effect/sql-mysql2`: MySQL
- `ManagedRuntime` from `effect`: Integrate Effect with 3rd party frameworks like React.

### ManagedRuntime guidance

`ManagedRuntime` is an escape hatch for calling Effect code from outside Effect code (similar to how `useEffect` bridges side effects in React). Do not use `ManagedRuntime` when you are already inside Effect code.

`ManagedRuntime` owns layer lifecycle. Running an Effect through a `ManagedRuntime` constructs and manages its layers. If your app already constructs layers through `layerCli`, introducing a `ManagedRuntime` can initialize a second copy of those layers (once via `layerCli`, once via `ManagedRuntime`).

In this codebase, prefer the layer already provided by `layerCli` instead of creating a separate `ManagedRuntime`. If you need `ManagedRuntime` semantics, make `layerCli` return a `ManagedRuntime` so layers are constructed once.

Use the `effect_docs_search` MCP tool to find more information about these modules.

## React Compiler

This codebase uses React Compiler. **Never use `useCallback`, `useMemo`, or `React.memo` manually** — the compiler handles memoization automatically. Write plain functions and values; the compiler will optimize them.

## React Component Guidelines

### No ternaries in JSX

**Never use ternary operators for conditional rendering in JSX.** Use simple `&&` conditionals instead.

**BAD — ternary in JSX:**

```tsx
{
  items.length === 0 ? <EmptyState /> : <ItemList items={items} />;
}
```

**GOOD — simple conditionals:**

```tsx
{
  items.length === 0 && <EmptyState />;
}
{
  items.length > 0 && <ItemList items={items} />;
}
```

Early returns inside callback bodies are acceptable since they read like normal control flow.

### Side-effects belong in the component that triggers them

Use Effect Atom (`useAtomSet`, `useAtomValue`) directly in the component that causes the side-effect. **Do not** bubble data up through callbacks just to perform a mutation in a parent component.

**BAD — parent owns the mutation, child passes data up via callback:**

```tsx
// Parent
function ParentPage() {
  const triggerCreate = useAtomSet(createMutation);
  const handleCreate = (form: CreateForm) => {
    triggerCreate({ payload: { ...form } });
  };
  return <CreateDialog onCreate={handleCreate} />;
}
```

**GOOD — component that triggers the side-effect owns it:**

```tsx
function ParentPage() {
  return <CreateDialog />;
}

function CreateDialog() {
  const triggerCreate = useAtomSet(createMutation);
  const handleSubmit = () => {
    triggerCreate({ payload: { ...form } });
  };
}
```

### Atom mutation pattern

When firing mutations that can fail, use `useAtom` with `{ mode: "promiseExit" }`:

```tsx
import { useAtom } from "@effect/atom-react"
import { ErrorDisplay } from "@/components/ui/error-display"

function MyComponent() {
  const [mutationResult, triggerMutation] = useAtom(myMutation, { mode: "promiseExit" })

  const handleAction = async () => {
    await triggerMutation({ payload: { ... } })
  }

  const pending = mutationResult._tag === "pending"
  const cause = mutationResult._tag === "failure" ? mutationResult.cause : undefined

  return (
    <>
      <Button onClick={handleAction} disabled={pending}>
        {pending ? "Working..." : "Do Action"}
      </Button>
      {cause && <ErrorDisplay cause={cause} />}
    </>
  )
}
```

### AsyncResult rendering pattern

**Always use `AsyncResult.builder(...)` when rendering UI that depends on an `AsyncResult`.** Never manually check `AsyncResult.isSuccess(result)` with conditionals in JSX.

**BAD — manual AsyncResult checks:**

```tsx
const result = useAtomValue(myAtom);
const isLoading = !AsyncResult.isSuccess(result);
const data = AsyncResult.isSuccess(result) ? result.value : undefined;
```

**GOOD — AsyncResult.builder:**

```tsx
const result = useAtomValue(myAtom);

return AsyncResult.builder(result)
  .onWaiting(() => <Spinner />)
  .onSuccess((data) => <MyComponent data={data} />)
  .orNull();
```

For mutation atoms, use `.waiting` for pending state and `AsyncResult.isSuccess()` for completion:

```tsx
const [result, trigger] = useAtom(myMutationFn, { mode: "promiseExit" });
const pending = result.waiting;
const succeeded = AsyncResult.isSuccess(result);
```

### Minimize prop passing

Prefer reading atoms directly in the component that needs the data over threading props through multiple layers. Any component can `useAtomValue(someAtom)` to subscribe to shared state without prop drilling.

## Runtime Logs for Debugging

All Effect logs (frontend + backend) are persisted to `.expect/logs.md` via the `DebugFileLogger`. Each log line includes a `source` field (`Frontend` or `Backend`), structured annotations, span timings, and fiber IDs.

**Log format:**

```
[2025-01-15T10:30:00.000Z] [INFO] [source: Backend] Block committed | blockId=blk_1 service=ami-rpc fiber=#1
```

**Searching logs to debug issues:**

```bash
# All backend logs
cat .expect/logs.md | grep "source: Backend"

# All frontend logs
cat .expect/logs.md | grep "source: Frontend"

# Filter by annotation
cat .expect/logs.md | grep "module: userCompaniesAtom"

# Filter by log level
cat .expect/logs.md | grep "\[ERROR\]"

# Combine filters
cat .expect/logs.md | grep "source: Backend" | grep "\[ERROR\]"
```

## Tooling

All tooling is run through pnpm scripts defined in the root `package.json`.

- `pnpm install` — install dependencies
- `pnpm dev` — run development server (via Turbo)
- `pnpm build` — build for production (via Turbo)
- `pnpm lint` — lint code
- `pnpm lint:fix` — lint and auto-fix
- `pnpm format` — format code
- `pnpm format:check` — check formatting
- `pnpm check` — run format, lint, and type checks
- `pnpm test` — run tests

## Verification Steps

Before considering work complete, run these checks:

1. **Type-checking:** `pnpm typecheck` (runs `tsgo --noEmit` in all packages via turbo)
2. **Tests:** `pnpm test` (runs `vitest run --testTimeout 0 --bail=1` — no timeout, stops at first failure so you can focus on one error at a time)
3. **Build:** `pnpm build`
