# Expect TypeScript SDK

Published as `expect-sdk` on npm. Used by coding agents (Claude Code, Codex CLI, Cursor) to generate browser tests, and by the Expect CLI to generate and cache ran tests. Inspired by [Claude Agent SDK V2](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview).

## Design Principles

1. **Within distribution** - Agents should one-shot the SDK without additional documentation. APIs use familiar shapes from Playwright and the Claude Agent SDK so models generate correct code from training data alone. Strong types enforce correct usage at compile time.

2. **Interoperable with Playwright** - Setup and teardown accept `string` (AI-driven) or `(page: Page) => Promise<void | string>` (Playwright callback). Use Playwright for deterministic setup, AI for fuzzy verification. Incrementally adoptable alongside existing test suites.

3. **Composable primitives** - `Expect.test()`, `Expect.session()`, and `Expect.cookies()` compose into arbitrarily complex test scenarios through plain JavaScript. Sessions persist browser state. Cookies extract and merge via arrays. No DSL - composition is just code.

---

## API

```ts
import Expect from "expect-sdk";
import { Expect, tool, defineConfig, configure } from "expect-sdk";
```

### Types

```ts
type Action = string | ((page: import("playwright").Page) => Promise<void | string>);
type BrowserName = "chrome" | "firefox" | "safari" | "edge" | "brave" | "arc";
type CookieInput = true | BrowserName | BrowserName[] | Cookie[];
type Test = string | { title?: string; prompt: string };

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

interface Tool {
  name: string;
  description: string;
  schema: StandardJSONSchemaV1 | Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<string>;
}

interface TestResult {
  status: "pending" | "passed" | "failed";
  url: string;
  duration: number;
  recordingPath?: string;
  steps: StepResult[];
  errors: StepResult[];
}

interface StepResult {
  title: string;
  status: "pending" | "passed" | "failed";
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
  session(config: SessionConfig): ExpectSession;
  cookies(browser: true | BrowserName | BrowserName[]): Promise<Cookie[]>;
}
```

### `Expect.test(input): TestRun`

One-shot test. Creates a browser, runs tests, closes. Returns a `TestRun` - both `PromiseLike<TestResult>` and `AsyncIterable<TestEvent>`.

```ts
interface TestInput {
  url?: string;
  page?: import("playwright").Page;
  cookies?: CookieInput;
  tools?: Tool[];
  tests: Test[];
  setup?: Action;
  teardown?: Action;
  mode?: "headed" | "headless";
  timeout?: number;
  isRecording?: boolean;
}
```

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

With detailed prompts:

```ts
const result = await Expect.test({
  url: "http://localhost:3000/dashboard",
  tests: [
    "sidebar navigation works",
    {
      title: "dashboard loads correctly",
      prompt: "verify the user's name appears in the header, sidebar shows Settings/Projects/Team, no loading spinners remain after 3 seconds, no console errors",
    },
  ],
});
```

Streaming:

```ts
const run = Expect.test({
  url: "http://localhost:3000/login",
  tests: ["signing in redirects to the dashboard"],
});

for await (const event of run) {
  if (event.type === "step:passed") console.log(`PASS: ${event.step.title}`);
  if (event.type === "step:failed") console.log(`FAIL: ${event.step.title}`);
}

const result = await run;
```

Playwright page:

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

Tools, setup, teardown:

```ts
await Expect.test({
  url: "/admin",
  cookies: "chrome",
  tools: [createUser, deleteUser],
  setup: async (page) => {
    await page.fill("#email", "admin@test.com");
    await page.click("button[type=submit]");
    await page.waitForURL("/dashboard");
    const username = await page.textContent("#username");
    return `the logged-in user is "${username}"`;
  },
  tests: ["admin can create a new user and see them in the table"],
  teardown: "delete any users created during this test",
});
```

### `Expect.session(config): ExpectSession`

Persistent browser context. Call `.test()` for each batch - each gets a fresh page, but cookies and localStorage persist. Call `.close()` when done.

```ts
interface SessionConfig {
  url?: string;
  browserContext?: import("playwright").BrowserContext;
  cookies?: CookieInput;
  tools?: Tool[];
  hooks?: SessionHooks;
  mode?: "headed" | "headless";
  timeout?: number;
  isRecording?: boolean;
}

interface SessionHooks {
  beforeAll?: Action;
  afterAll?: Action;
  beforeEach?: Action;
  afterEach?: Action;
}

interface ExpectSession {
  test(input: SessionTestInput): TestRun;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

interface SessionTestInput {
  url?: string;
  tests: Test[];
  setup?: Action;
  teardown?: Action;
  mode?: "headed" | "headless";
  timeout?: number;
  isRecording?: boolean;
}
```

```ts
const session = Expect.session({ url: "http://localhost:3000", cookies: "chrome" });

const r1 = await session.test({ url: "/login", tests: ["login works"] });
const r2 = await session.test({
  url: "/dashboard",
  tests: ["dashboard loads while authenticated"],
});
const r3 = await session.test({ url: "/settings", tests: ["settings page accessible"] });

await session.close();
```

With hooks:

```ts
const session = Expect.session({
  url: "http://localhost:3000",
  cookies: "chrome",
  hooks: {
    beforeAll: "seed the database with test data",
    beforeEach: async (page) => {
      await page.goto("/");
    },
    afterEach: "clear any modals or toasts",
    afterAll: "clean up test data",
  },
});

const r1 = await session.test({ tests: ["login works"] });
const r2 = await session.test({ tests: ["dashboard works"] });
await session.close();
```

Existing Playwright browser context:

```ts
const browserContext = await browser.newContext();
const session = Expect.session({ browserContext });
const r1 = await session.test({ url: "/login", tests: ["login works"] });
await session.close();
```

### `tool(name, description, schema, handler): Tool`

Creates a custom tool the AI agent can call during test execution. Accepts Standard JSON Schema (zod v4, arktype, valibot) or raw JSON Schema. The SDK wraps tools into an in-process MCP server automatically.

```ts
import { z } from "zod";

const createUser = tool(
  "create_user",
  "Create a test user",
  z.object({ email: z.string(), role: z.enum(["admin", "member"]) }),
  async ({ email, role }) => {
    const user = await workos.users.create({ email, role });
    return `Created user ${user.email} with ID ${user.id}`;
  },
);

const deleteUser = tool(
  "delete_user",
  "Delete a test user",
  { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  async (input) => {
    await workos.users.delete(input.id as string);
    return `Deleted user ${input.id}`;
  },
);
```

Tools compose via arrays:

```ts
const workosTools = [createUser, deleteUser, listUsers];
const stripeTools = [createCustomer, createSubscription];

await Expect.test({
  url: "/billing",
  tools: [...workosTools, ...stripeTools],
  tests: ["billing page shows active subscription for the user"],
});
```

### `Expect.cookies(browser): Promise<Cookie[]>`

Extracts cookies from a local browser profile. Returns a Playwright-compatible `Cookie[]` for composition via spread.

```ts
await Expect.test({ url: "/dashboard", cookies: true, tests: ["dashboard loads"] });
await Expect.test({ url: "/dashboard", cookies: "chrome", tests: ["dashboard loads"] });
await Expect.test({ url: "/dashboard", cookies: ["chrome", "safari"], tests: ["dashboard loads"] });

const chrome = await Expect.cookies("chrome");
await Expect.test({
  url: "/dashboard",
  cookies: [...chrome, { name: "api_token", value: "xyz", domain: ".example.com" }],
  tests: ["dashboard loads with auth"],
});
```

### `defineConfig(config): ExpectConfig`

Identity function for type inference in `expect.config.ts` files.

### `configure(config): void`

Shallow-merges partial config into global state. Inline alternative to config files.

```ts
interface ExpectConfig {
  baseUrl?: string;
  browser?: BrowserName;
  mode?: "headed" | "headless";
  cookies?: CookieInput;
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
  browser: "chrome",
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
  |- expect-sdk (test execution via Expect.test / Expect.session)
  |- @expect/supervisor (plan generation, flow storage, watch mode, git)

expect-sdk (packages/typescript-sdk)
  |- @expect/supervisor (Executor)
       |- @expect/agent (LLM)
       |- @expect/browser (Playwright + MCP)
       |- @expect/cookies (cookie extraction)
       |- @expect/shared (models)
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
- Browser lifecycle (one-shot auto-close, session manual close)

What the CLI owns (uses supervisor directly):

- Plan generation from git diffs
- Flow storage and caching (`FlowStorage`)
- Watch mode (`Watch`)
- Interactive TUI (Ink rendering of `TestEvent` stream)
- Replay proxy, live view push
- Analytics / telemetry
- Video generation (`RrVideo`)
- GitHub Actions integration
- `Reporter.report` (post-execution summary)

### CLI Runner

`expect-cli` can run SDK test files directly. No manual setup required.

```bash
expect-cli run
```

1. Globs for `**/*.expect.ts` files in the project
2. Auto-installs `expect-sdk` as a dev dependency if missing
3. Runs each file with `tsx`
4. Collects results automatically (every `Expect.test()` call registers internally)
5. Prints results, exits 0 on all pass, 1 on any failure

Test files are plain scripts. No exports needed:

```ts
// login.expect.ts
import { Expect } from "expect-sdk";

await Expect.test({
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

await Expect.test({ url: "/login", tests: ["login page loads"] });
await Expect.test({ url: "/signup", tests: ["signup page loads"] });
```

Run a single file:

```bash
expect-cli run login.expect.ts
```

---

## SKILL.md Addition

The following section is added to the existing `packages/expect-skill/SKILL.md`. It teaches agents to use the SDK for programmatic tests.

Defaults: `mode: "headless"`, `browser: "chrome"`, API key from `ANTHROPIC_API_KEY`, 5-minute timeout, `rootDir: process.cwd()`.

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

**Always check `result.status`.** Do not assume the test passed. Read `result.errors` for failed steps with AI summaries.

**Bad - fire and forget:**

```ts
await Expect.test({ url: "/login", tests: ["login works"] });
console.log("done"); // you don't know if it passed
```

**Good - check results, act on failures:**

```ts
const result = await Expect.test({ url: "/login", tests: ["login works"] });
if (result.status === "failed") {
  throw new Error(result.errors.map((e) => e.summary).join("\n"));
}
```

### Writing SDK tests

Same rule as CLI: think like a user trying to break the feature.

**Bad:** `tests: ["the page loads"]`
**Good:** `tests: ["submitting empty form shows validation errors", "valid submission redirects to dashboard"]`

### Sessions

Use `Expect.session()` when tests need shared browser state (e.g., login persists across pages):

```ts
const session = Expect.session({ url: "http://localhost:3000", cookies: "chrome" });
const r1 = await session.test({ url: "/login", tests: ["login works"] });
const r2 = await session.test({ url: "/dashboard", tests: ["dashboard loads"] });
await session.close();
```

Do not use a session when a single `Expect.test()` with `setup` would suffice.

### Key patterns

Pass `setup`/`teardown` as a string (AI executes) or Playwright callback. Pass `cookies: "chrome"` for auth. Pass `page` to reuse an existing Playwright page.

```ts
await Expect.test({
  url: "/admin",
  cookies: "chrome",
  setup: "navigate to user management",
  tests: ["user table shows all accounts"],
  teardown: "delete any test users",
});
```

### All fields (`Expect.test`)

| Field         | Type                                               | Default      |
| ------------- | -------------------------------------------------- | ------------ |
| `url`         | `string`                                           | -            |
| `page`        | `Page`                                             | -            |
| `cookies`     | `true \| BrowserName \| BrowserName[] \| Cookie[]` | -            |
| `tools`       | `Tool[]`                                           | -            |
| `tests`       | `(string \| { title?, prompt })[]`                 | **required** |
| `setup`       | `string \| (page) => Promise<void \| string>`      | -            |
| `teardown`    | `string \| (page) => Promise<void \| string>`      | -            |
| `mode`        | `"headed" \| "headless"`                           | `"headless"` |
| `timeout`     | `number`                                           | `300000`     |
| `isRecording` | `boolean`                                          | `false`      |

Config file is optional: `defineConfig({ baseUrl, cookies })` in `expect.config.ts` enables relative URLs.
````

---

## Decisions

- **Two functions, two responsibilities.** `Expect.test()` runs tests (one-shot, auto-closes browser). `Expect.session()` manages browser lifecycle (persistent, manual close). No overloads, no dual modes.
- **`tests` is `string[]`.** No callbacks, no objects, no context per-test. Data flows through closures and `setup` return values. Simple and within distribution.
- **No "skipped" status.** Every test is "passed" or "failed". `status` is "passed" only when every step passed.
- **Session page model.** Each `session.test()` creates a fresh page within the shared browser context. Cookies and localStorage persist; DOM state does not.
- **Playwright optional peer dep.** String-based setup/teardown works without Playwright. The `(page: Page) => Promise<void | string>` callback requires Playwright installed.
- **`await using` supported, not required.** `ExpectSession` implements `Symbol.asyncDispose`.
- **`url` vs `page`/`browserContext` precedence.** `page` on `TestInput`: SDK uses it directly, `url` is ignored. `browserContext` on `SessionConfig`: SDK creates pages from it. If neither is provided and no `baseUrl` exists, throws `ExpectConfigError`.
- **Hook + setup ordering.** `beforeEach` -> `setup` -> tests -> `teardown` -> `afterEach`. `beforeAll` on session creation, `afterAll` on close.
- **`errors` is derived.** Always `steps.filter(s => s.status === "failed")`.
- **`TestRun` is both promise and async iterable.** `await` gives `TestResult`. `for await` streams `TestEvent`s.
- **CLI builds on the SDK.** The CLI uses `Expect.test()` / `Expect.session()` for execution and supervisor directly for plan generation, flow caching, and watch mode.
- **Plan generation stays in supervisor.** The SDK doesn't know about plans or diffs.
- **Parallel execution.** Sequential by default. Parallel via `Promise.all` on the caller side.

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
- Tests included as numbered list

### Config (`config.ts`)

- `defineConfig` returns same reference
- `configure` merges successive calls
- Later values override earlier ones
- `resetGlobalConfig` clears all values

### Input validation

- Throws for empty tests array
- Throws for relative URL without baseUrl
- Throws when neither `url` nor `page` is provided (and no baseUrl)

### Result building

- `StepCompleted` events map to `"passed"`
- `StepFailed` and `StepSkipped` events map to `"failed"`
- Steps with no matching event default to `"pending"`
- `status` is "passed" only when all steps passed
- `status` is "failed" when any step failed
- `status` is "pending" while execution is in progress
- `errors` equals `steps.filter(s => s.status === "failed")`
- Screenshots associated with steps via event stream

### TestRun streaming

- `await run` resolves to `TestResult`
- `for await (const event of run)` yields `TestEvent`s in order
- `run:started` fires first
- `step:started` fires before each step
- `step:passed` / `step:failed` fire with `StepResult`
- `step:skipped` fires with title and reason
- `completed` fires last with final `TestResult`
- `screenshot` fires with path
- Iterating and awaiting the same `TestRun` both work

### Sessions

- `session.test()` creates a fresh page per call
- Cookies and localStorage persist across `session.test()` calls
- `session.close()` destroys the browser context
- `Symbol.asyncDispose` calls `close()`
- `beforeAll` runs once on session creation
- `afterAll` runs once on close
- `beforeEach` runs before each `session.test()` setup
- `afterEach` runs after each `session.test()` teardown
- Hook ordering: `beforeEach` -> `setup` -> tests -> `teardown` -> `afterEach`

### Setup and teardown

- String setup is passed to the AI as an instruction
- Function setup receives the Playwright page
- Function setup returning a string passes it as AI context
- Function setup returning void has no AI context
- Teardown runs even when tests fail

### Cookies

- `Expect.cookies("chrome")` returns `Cookie[]`
- `Expect.cookies(true)` auto-detects and extracts
- `Expect.cookies(["chrome", "safari"])` extracts from multiple, merges
- `cookies: true` / `"chrome"` / `["chrome", "safari"]` / `Cookie[]` all work
- Spread composition: `[...extracted, ...custom]`

### Custom tools

- `tool()` with Standard JSON Schema creates a typed tool
- `tool()` with raw JSON Schema creates an untyped tool
- Tools registered as in-process MCP server
- Tool handler receives parsed input, returns string
- Tools compose via array spread
- Session-level tools available to all `session.test()` calls

### Playwright interop

- `page` field uses existing page, skips browser creation
- `url` is ignored when `page` is provided
- `browserContext` field uses existing context for sessions
- SDK does not close externally-provided page/context

---

## Non-goals (v1)

- Test generation from diffs (that's the CLI)
- Interactive TUI / plan review
- Watch mode
- Imperative matchers (`toContainText`, etc.)
- Dev server lifecycle management
