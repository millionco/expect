# TypeScript SDK

Published as `expect-sdk` on npm. Used by coding agents (Claude Code, Codex CLI, Cursor) to generate browser tests, and by the Expect CLI to generate and cache ran tests. Inspired by [Claude Agent SDK V2](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview).

## Design Principles

1. **Within distribution** - Agents should one-shot the SDK without additional documentation. APIs use familiar shapes from Playwright and the Claude Agent SDK so models generate correct code from training data alone. Strong types enforce correct usage at compile time - branded types, discriminated unions, no `any`.

2. **Interoperable with Playwright** - Setup and teardown accept `string` (AI-driven) or `(page: Page) => Promise<void>` (Playwright callback). Use Playwright for deterministic setup, AI for fuzzy verification. Incrementally adoptable alongside existing test suites.

3. **Composable primitives** - `Expect.test()`, `Expect.session()`, `Expect.withSession()`, and `Expect.cookies()` compose into arbitrarily complex test scenarios through plain JavaScript (async functions, spread, conditionals). Sessions persist browser state across tests. Cookies extract and merge via arrays. No DSL - composition is just code.

---

## API

```ts
import { Expect, defineConfig, configure } from "expect-sdk";
```

### Types

```ts
type Context = string | Record<string, unknown>;
type SetupFn = string | ((page: import("playwright").Page) => Promise<void>);
type BrowserEngine = "chromium" | "firefox" | "webkit";
type BrowserName = "chrome" | "firefox" | "safari" | "edge" | "brave" | "arc";
type CookieInput = true | BrowserName | BrowserName[] | Cookie[];
type Test = string | { title: string; context?: Context };

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

interface TestResult {
  isSuccess: boolean;
  url: string;
  duration: number;
  recordingPath?: string;
  steps: StepResult[];
  errors: StepResult[];
}

interface StepResult {
  title: string;
  status: "passed" | "failed";
  summary: string;
  screenshotPath?: string;
  duration: number;
}

type TestEvent =
  | { type: "run:started"; title: string; baseUrl?: string }
  | { type: "step:started"; title: string }
  | { type: "step:passed"; step: StepResult }
  | { type: "step:failed"; step: StepResult }
  | { type: "step:skipped"; title: string; reason: string }
  | { type: "screenshot"; title: string; path: string }
  | { type: "completed"; result: TestResult };

interface TestRun extends PromiseLike<TestResult> {
  [Symbol.asyncIterator](): AsyncIterator<TestEvent>;
}
```

### `Expect`

```ts
interface Expect {
  test(input: TestInput): TestRun;
  session(config: SessionConfig): Promise<ExpectSession>;
  withSession<T>(config: SessionConfig, fn: (session: ExpectSession) => Promise<T>): Promise<T>;
  cookies(browser: true | BrowserName | BrowserName[]): Promise<Cookie[]>;
}
```

### `Expect.test(input): TestRun`

One-shot test. Creates an ephemeral browser session, runs tests, closes. Returns a `TestRun` - both a `PromiseLike<TestResult>` and an `AsyncIterable<TestEvent>`.

`await` for simple usage. `for await` for streaming progress.

```ts
interface TestInput {
  url?: string;
  page?: import("playwright").Page;
  context?: Context;
  cookies?: CookieInput;
  tests: Test[];
  setup?: SetupFn;
  teardown?: SetupFn;
  mode?: "headed" | "headless";
  timeout?: number;
  isRecording?: boolean;
}
```

Simple - just await the result:

```ts
const result = await Expect.test({
  url: "http://localhost:3000/login",
  tests: [
    "signing in with valid credentials redirects to the dashboard",
    "invalid credentials show an error message",
  ],
});
```

Streaming - iterate progress events:

```ts
const run = Expect.test({
  url: "http://localhost:3000/login",
  tests: [
    "signing in with valid credentials redirects to the dashboard",
    "invalid credentials show an error message",
  ],
});

for await (const event of run) {
  if (event.type === "step:passed") console.log(`PASS: ${event.step.title}`);
  if (event.type === "step:failed") console.log(`FAIL: ${event.step.title}`);
}

const result = await run;
```

With shared context:

```ts
const result = await Expect.test({
  url: "/login",
  context: { email: "test@example.com", password: "password123" },
  tests: [
    "signing in with valid credentials redirects to the dashboard",
    "invalid credentials show an error message",
  ],
});
```

Per-test context (replaces shared context - no merging):

```ts
const result = await Expect.test({
  url: "/login",
  tests: [
    "forgot password link navigates to /reset-password",
    {
      title: "signing in with valid credentials redirects to the dashboard",
      context: { email: "test@example.com", password: "password123" },
    },
    {
      title: "invalid credentials show an error message",
      context: { email: "wrong@example.com", password: "badpassword" },
    },
    {
      title: "shows a maintenance banner",
      context: "the app is in maintenance mode",
    },
  ],
});
```

With an existing Playwright page (skips browser creation, `url` is optional since the page is already navigated):

```ts
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3000/login");
await page.fill("#email", "test@test.com");

const result = await Expect.test({
  page,
  tests: ["login form is pre-filled with test@test.com"],
});
```

Setup and teardown - string (AI-driven) or Playwright callback:

```ts
await Expect.test({
  url: "/admin",
  setup: async (page) => {
    await page.fill("#email", "admin@test.com");
    await page.fill("#password", "admin123");
    await page.click("button[type=submit]");
    await page.waitForURL("/dashboard");
  },
  tests: ["admin panel shows user management table"],
  teardown: "delete any users created during this test",
});

await Expect.test({
  url: "/login",
  setup: "log in as admin using email admin@test.com and password admin123",
  tests: ["dashboard shows welcome banner for admin"],
});
```

### `Expect.session(config): Promise<ExpectSession>`

Creates a persistent browser context. Each `session.test()` gets a fresh page; cookies and localStorage persist across tests.

```ts
interface SessionConfig {
  url?: string;
  browserContext?: import("playwright").BrowserContext;
  context?: Context;
  cookies?: CookieInput;
  hooks?: SessionHooks;
  mode?: "headed" | "headless";
  timeout?: number;
  isRecording?: boolean;
}

interface SessionHooks {
  beforeAll?: SetupFn;
  afterAll?: SetupFn;
  beforeEach?: SetupFn;
  afterEach?: SetupFn;
}

interface ExpectSession {
  test(input: SessionTestInput): TestRun;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

interface SessionTestInput {
  url?: string;
  context?: Context;
  tests: Test[];
  setup?: SetupFn;
  teardown?: SetupFn;
  mode?: "headed" | "headless";
  timeout?: number;
  isRecording?: boolean;
}
```

```ts
const session = await Expect.session({
  url: "http://localhost:3000",
  cookies: "chrome",
});

await session.test({
  url: "/login",
  context: { email: "admin@test.com", password: "admin123" },
  tests: ["signing in redirects to dashboard"],
});

await session.test({
  url: "/settings",
  tests: ["settings page loads while authenticated"],
});

await session.close();
```

With an existing Playwright browser context:

```ts
import { chromium } from "playwright";

const browser = await chromium.launch();
const browserContext = await browser.newContext();

const session = await Expect.session({ browserContext });
await session.test({ url: "/login", tests: ["login page loads"] });
await session.close();
```

With hooks:

```ts
const session = await Expect.session({
  url: "http://localhost:3000",
  hooks: {
    beforeAll: "seed the database with test data",
    beforeEach: async (page) => {
      await page.goto("/");
    },
    afterEach: "clear any modals or toasts",
    afterAll: "clean up test data",
  },
});
```

### `Expect.withSession<T>(config, fn): Promise<T>`

Scoped session with auto-cleanup. Calls `session.close()` in a `try/finally` when `fn` completes or throws. Returns the callback's return value.

```ts
await Expect.withSession({ url: "http://localhost:3000" }, async (session) => {
  await session.test({ url: "/login", tests: ["login works"] });
  await session.test({ url: "/dashboard", tests: ["dashboard loads"] });
});
```

Composition is regular async code:

```ts
const loginAs = async (session: ExpectSession, email: string) => {
  return session.test({
    url: "/login",
    context: { email, password: "password123" },
    tests: ["signing in redirects to dashboard"],
  });
};

await Expect.withSession({ url: "http://localhost:3000" }, async (session) => {
  await loginAs(session, "admin@test.com");

  const result = await session.test({
    url: "/admin",
    tests: ["admin panel is accessible"],
  });

  if (result.isSuccess) {
    await session.test({
      setup: "create a new user called Test User",
      tests: ["user appears in the user table"],
      teardown: "delete Test User",
    });
  }
});
```

### `Expect.cookies(browser): Promise<Cookie[]>`

Extracts cookies from a local browser profile. Returns a Playwright-compatible `Cookie[]` for composition via spread.

```ts
// Auto-detect any available browser
await Expect.test({ url: "/dashboard", cookies: true, tests: ["dashboard loads"] });

// Specific browser
await Expect.test({ url: "/dashboard", cookies: "chrome", tests: ["dashboard loads"] });

// Multiple browsers merged
await Expect.test({ url: "/dashboard", cookies: ["chrome", "safari"], tests: ["dashboard loads"] });

// Compose extracted + custom
const chrome = await Expect.cookies("chrome");
await Expect.test({
  url: "/dashboard",
  cookies: [...chrome, { name: "api_token", value: "xyz", domain: ".example.com" }],
  tests: ["dashboard loads with auth"],
});

// Auto-detect extraction
const all = await Expect.cookies(true);
```

### `defineConfig(config): ExpectConfig`

Identity function for type inference in `expect.config.ts` files.

### `configure(config): void`

Shallow-merges partial config into global state. Inline alternative to config files.

```ts
interface ExpectConfig {
  baseUrl?: string;
  browser?: BrowserEngine;
  mode?: "headed" | "headless";
  cookies?: CookieInput;
  context?: Context;
  timeout?: number;
  model?: string;
  apiKey?: string;
  rootDir?: string;
}
```

```ts
// expect.config.ts
import { defineConfig } from "expect-sdk";

export default defineConfig({
  baseUrl: "http://localhost:3000",
  browser: "chromium",
  mode: "headless",
  cookies: "chrome",
});
```

```ts
// Inline
import { Expect, configure } from "expect-sdk";
configure({ baseUrl: "http://localhost:3000" });
```

---

## Architecture

Package at `packages/typescript-sdk/`, published as `expect-sdk`. The SDK is the core API layer. The CLI builds on top of it.

```
expect-cli (apps/cli)
  ├─ expect-sdk (test execution via Expect.test / Expect.session)
  └─ @expect/supervisor (plan generation, flow storage, watch mode, git)

expect-sdk (packages/typescript-sdk)
  └─ @expect/supervisor (Executor)
       ├─ @expect/agent (LLM)
       ├─ @expect/browser (Playwright + MCP)
       ├─ @expect/cookies (cookie extraction)
       └─ @expect/shared (models)
```

The SDK does not depend on the CLI or Ink. `TestRun` is both `PromiseLike<TestResult>` and `AsyncIterable<TestEvent>`. Effect is an internal implementation detail.

### Ownership

What the SDK owns:

- Test execution (wraps `Executor.execute` stream internally)
- Config resolution (`defineConfig`, `configure`, `baseUrl`)
- URL resolution, instruction building
- Timeout handling
- Cookie resolution (preset string to `Cookie[]`)
- Result building (`TestResult` from execution events)
- `TestEvent` stream (maps internal `ExecutedTestPlan` snapshots to `TestEvent` union)

What the CLI owns (uses supervisor directly):

- Plan generation from git diffs (`Git.getChangedFiles`, `buildExecutionPrompt`)
- Flow storage and caching (`FlowStorage`)
- Watch mode (`Watch`)
- Interactive TUI (Ink rendering of `TestEvent` stream)
- Replay proxy, live view push
- Analytics / telemetry
- Video generation (`RrVideo`)
- GitHub Actions integration (PR comments, outputs)
- `Reporter.report` (post-execution summary)

What supervisor provides to both:

- `Executor` (consumed by SDK, not CLI directly)
- `Git` (consumed by CLI for diffs, by SDK internally for repo root)
- `Reporter` (consumed by CLI after execution)
- `FlowStorage`, `Watch`, `Github` (consumed by CLI only)

### CLI migration path

The CLI currently consumes `executor.execute()` as an Effect `Stream<ExecutedTestPlan>` in two files:

- `apps/cli/src/data/execution-atom.ts` (interactive TUI)
- `apps/cli/src/utils/run-test.ts` (headless/CI)

Both use `Stream.tap` to react to each `ExecutedTestPlan` snapshot, then `Stream.runLast` to get the final plan. To migrate:

1. Replace `executor.execute(options)` with `Expect.test(input)` (returns `TestRun`)
2. Replace `Stream.tap` with `for await (const event of run)` iterating `TestEvent`s
3. The CLI builds its own UI state from `TestEvent`s instead of receiving full `ExecutedTestPlan` snapshots
4. `Reporter.report`, analytics, replay proxy, video generation stay in the CLI and run after `await run` completes

The `ExecutedTestPlan` snapshot (full plan object on every event) is richer than `TestEvent` (lightweight discriminated union). The CLI loses direct access to tool call events and the full step/event arrays on each tick. If the TUI needs these for rendering (e.g. active step tool rows), the SDK would need to expose them as additional `TestEvent` variants or the CLI reconstructs state from the event stream.

### CLI Runner

`expect-cli` can run SDK test files directly. No manual setup required.

```bash
expect-cli run
```

1. Globs for `**/*.expect.ts` files in the project
2. Auto-installs `expect-sdk` as a dev dependency if missing
3. Runs each file with `tsx`
4. Collects `TestResult` from each file's default export
5. Prints results, exits 0 on all pass, 1 on any failure

Test files export a `TestResult` or `TestResult[]`:

```ts
// login.expect.ts
import { Expect } from "expect-sdk";

export default await Expect.test({
  url: "http://localhost:3000/login",
  tests: [
    "signing in with valid credentials redirects to the dashboard",
    "invalid credentials show an error message",
  ],
});
```

```ts
// auth.expect.ts
import { Expect } from "expect-sdk";

const login = await Expect.test({
  url: "/login",
  tests: ["login page loads"],
});

const signup = await Expect.test({
  url: "/signup",
  tests: ["signup page loads"],
});

export default [login, signup];
```

Run a single file:

```bash
expect-cli run login.expect.ts
```

`expect-cli run` outputs the same structured results as `expect-cli -m`, including `--json` support.

---

## SKILL.md Addition

The following section is added to the existing `packages/expect-skill/SKILL.md` (after "The Command" section). It teaches agents to use the SDK for programmatic tests.

Defaults: `mode: "headless"`, `browser: "chromium"`, API key from `ANTHROPIC_API_KEY`, 5-minute timeout, `rootDir: process.cwd()`.

---

````markdown
## SDK (Programmatic)

Use `expect-sdk` when you need test results in code - CI scripts, test suites, custom tooling. Use `expect-cli` for everything else.

```ts
import { Expect } from "expect-sdk";

const result = await Expect.test({
  url: "http://localhost:3000/login",
  tests: [
    "signing in with valid credentials redirects to the dashboard",
    "invalid credentials show an error message",
  ],
});
```

`await` for the result. `for await` for real-time progress.

**Always check `result.isSuccess`.** Do not assume the test passed. Read `result.errors` for failed steps with AI summaries.

**Bad - fire and forget:**

```ts
await Expect.test({ url: "/login", tests: ["login works"] });
console.log("done"); // you don't know if it passed
```

**Good - check results, act on failures:**

```ts
const result = await Expect.test({ url: "/login", tests: ["login works"] });
if (!result.isSuccess) {
  throw new Error(result.errors.map((e) => e.summary).join("\n"));
}
```

### Writing SDK tests

Same rule as CLI: think like a user trying to break the feature.

**Bad:** `tests: ["the page loads"]`
**Good:** `tests: ["submitting empty form shows validation errors", "valid submission redirects to dashboard"]`

### When to use sessions

Use `Expect.test()` for isolated tests. Use `Expect.withSession()` only when tests need shared browser state (e.g., login persists across pages).

```ts
await Expect.withSession({ url: "http://localhost:3000" }, async (session) => {
  await session.test({
    url: "/login",
    context: { email: "admin@test.com", password: "admin123" },
    tests: ["signing in redirects to dashboard"],
  });
  await session.test({ url: "/settings", tests: ["settings loads while authenticated"] });
});
```

Do not create a session when a single `Expect.test()` with `setup` would suffice.

### Key patterns

Pass `context` for data the AI needs. Pass `setup`/`teardown` as a string (AI executes) or Playwright callback. Pass `cookies: "chrome"` for auth. Pass `page` to reuse an existing Playwright page.

```ts
await Expect.test({
  url: "/admin",
  cookies: "chrome",
  context: { role: "admin" },
  setup: "navigate to user management",
  tests: ["user table shows all accounts"],
  teardown: "delete any test users",
});
```

### All fields

| Field         | Type                                               | Default      |
| ------------- | -------------------------------------------------- | ------------ |
| `url`         | `string`                                           | -            |
| `page`        | `Page`                                             | -            |
| `context`     | `string \| object`                                 | -            |
| `cookies`     | `true \| BrowserName \| BrowserName[] \| Cookie[]` | -            |
| `tests`       | `(string \| { title, context? })[]`                | **required** |
| `setup`       | `string \| (page) => Promise<void>`                | -            |
| `teardown`    | `string \| (page) => Promise<void>`                | -            |
| `mode`        | `"headed" \| "headless"`                           | `"headless"` |
| `timeout`     | `number`                                           | `300000`     |
| `isRecording` | `boolean`                                          | `false`      |

Config file is optional: `defineConfig({ baseUrl, cookies })` in `expect.config.ts` enables relative URLs.
````

---

## Decisions

- **No "skipped" status.** Every test is "passed" or "failed". `isSuccess` is true only when every step passed.
- **Session page model.** Each `session.test()` creates a fresh page within the shared browser context. Cookies and localStorage persist across tests; DOM state does not.
- **Playwright optional peer dep.** String-based setup/teardown works without Playwright. The `(page: Page) => Promise<void>` callback overload requires Playwright installed. The type uses `import("playwright").Page` - compile error if missing, which is the correct signal.
- **`await using` supported, not required.** Sessions implement `Symbol.asyncDispose`. Use `await using`, `Expect.withSession()`, or manual `session.close()` - all three work.
- **`url` vs `page`/`browserContext` precedence.** When `page` is provided on `TestInput`, the SDK uses it directly and `url` is ignored. When `browserContext` is provided on `SessionConfig`, the SDK creates pages from it and `url` is only used for navigation. If neither `page`/`browserContext` nor `url` (with `baseUrl`) is provided, throws `ExpectConfigError`.
- **Hook + setup ordering.** Execution order: `beforeEach` → `setup` → tests → `teardown` → `afterEach`. Session hooks wrap per-test setup/teardown. `beforeAll` runs once on session creation, `afterAll` on session close.
- **`errors` is derived.** `errors` is always `steps.filter(s => s.status === "failed")`. It's a convenience field, not independent data.
- **`TestRun` is both promise and async iterable.** `await` gives `TestResult`. `for await` streams `TestEvent`s. One primitive, two consumption modes. The CLI streams events to the TUI; external consumers just `await`.
- **`TestEvent` is lighter than `ExecutedTestPlan`.** The SDK maps internal `ExecutedTestPlan` snapshots (full plan object on every agent event) to the `TestEvent` discriminated union. The CLI loses access to tool call details and the full step/event arrays per tick. If the TUI needs these for rendering (active step tool rows), either add `TestEvent` variants or have the CLI reconstruct state from events.
- **CLI builds on the SDK.** The CLI uses `Expect.test()` for execution (streaming events to the TUI) and supervisor directly for plan generation, flow caching, watch mode, and git. The SDK owns test execution, config resolution, timeouts, and result building. Reporter, analytics, replay proxy, and video generation stay in the CLI.
- **Plan generation stays in supervisor.** The CLI flow is: supervisor scans git diffs, CLI calls `Expect.test()` with the instruction, streams `TestEvent`s to the TUI. The SDK doesn't know about plans or diffs.
- **Parallel execution.** Sequential by default. Parallel via `Promise.all` on the caller side - not optimized for v1.
- **Dev server lifecycle.** The SDK does not manage dev servers. The caller ensures the URL is reachable.
- **Working tree only.** v1 validates against the working tree. Branch diff is a future addition.

---

## Test Coverage

### URL resolution (`build-instruction.ts`)

- Absolute URLs pass through unchanged (http, https)
- Relative URLs resolve against baseUrl (with/without leading slash)
- Trailing slash on baseUrl is normalized
- baseUrl ignored for absolute URLs
- Non-string URL throws with `Fix:` line
- Relative URL without baseUrl throws with `Fix:` line

### Instruction building (`build-instruction.ts`)

- Single and multiple tests numbered correctly
- Shared string/object context included as `Context:` line
- Per-test context replaces shared context
- Falls back to shared context when per-test context is undefined
- No `Context:` line when no context at either level
- Mixed string and object tests

### Config (`config.ts`)

- `defineConfig` returns same reference
- `configure` merges successive calls
- Later values override earlier ones
- `resetGlobalConfig` clears all values

### Input validation (`expect.ts`)

- `Expect.test` is a function
- Throws for empty tests array
- Throws for relative URL without baseUrl
- Does not throw for absolute URL with valid tests
- Throws when neither `url` nor `page` is provided (and no baseUrl)

### Result building

- `StepCompleted` events map to `"passed"`
- `StepFailed` and `StepSkipped` events map to `"failed"`
- Steps with no matching event default to `"failed"`
- `isSuccess` is true only when all steps passed
- `isSuccess` is false when steps array is empty
- `errors` equals `steps.filter(s => s.status === "failed")`
- Screenshots associated with steps via event stream
- Duration calculated correctly

### TestRun streaming

- `await run` resolves to `TestResult`
- `for await (const event of run)` yields `TestEvent`s in order
- `run:started` fires first with plan title and optional baseUrl
- `step:started` fires before each step executes
- `step:passed` fires with `StepResult` when step passes
- `step:failed` fires with `StepResult` when step fails
- `step:skipped` fires with title and reason when step is skipped
- `completed` fires last with final `TestResult`
- `screenshot` fires with path when screenshot is taken
- Iterating and awaiting the same `TestRun` both work
- `TestRun` can be awaited without iterating (simple mode)
- `TestRun` can be iterated without awaiting (stream-only mode)

### Timeout and error recovery

- Timeout produces empty plan with "Timed out" rationale
- `ExecutionError` produces empty plan with error message
- Execution always resolves, never rejects (after validation)

### Sessions

- `session.test()` creates a fresh page per call
- Cookies persist across `session.test()` calls
- `session.close()` destroys the browser context
- `Expect.withSession()` calls `close()` even when callback throws
- `Expect.withSession()` returns the callback's return value
- `Symbol.asyncDispose` calls `close()`
- `beforeAll` runs once on session creation
- `afterAll` runs once on session close
- `beforeEach` runs before each `session.test()` setup
- `afterEach` runs after each `session.test()` teardown
- Hook ordering: `beforeEach` -> `setup` -> tests -> `teardown` -> `afterEach`

### Setup and teardown

- String setup is passed to the AI as an instruction
- Function setup receives the Playwright page
- String teardown is passed to the AI
- Function teardown receives the Playwright page
- Teardown runs even when tests fail

### Cookies

- `Expect.cookies("chrome")` returns `Cookie[]`
- `Expect.cookies(true)` auto-detects available browser and extracts
- `Expect.cookies(["chrome", "safari"])` extracts from multiple, merges
- `cookies: true` auto-detects and injects
- `cookies: "chrome"` preset extracts and injects
- `cookies: ["chrome", "safari"]` extracts from multiple, merges and injects
- `cookies: Cookie[]` injects raw cookies
- Spread composition works: `[...extracted, ...custom]`

### Playwright interop

- `page` field uses existing page, skips browser creation
- `url` is ignored when `page` is provided
- `browserContext` field uses existing context for sessions
- SDK does not close externally-provided page/context

---

## Non-goals (v1)

- Test generation from diffs (that's the CLI)
- Integration with Interactive TUI / plan review
- Watch mode
- Imperative matchers (`toContainText`, etc.)
- Dev server lifecycle management
- Session resume / forking
