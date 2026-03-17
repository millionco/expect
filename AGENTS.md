# Browser Tester

pnpm monorepo. Vite+ (`vp`) for builds, lint, format, and test.

## Verify changes

```bash
pnpm lint && pnpm format:check
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

## Structured Logging

Use `Effect.logInfo`, `Effect.logWarning`, `Effect.logDebug` with structured data:

```ts
yield *
  Effect.logInfo("Chromium cookies extracted", {
    browser,
    count: cookies.length,
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

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ commands take precedence over `package.json` scripts. If there is a `test` script defined in `scripts` that conflicts with the built-in `vp test` command, run it using `vp run test`.
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
<!--VITE PLUS END-->
