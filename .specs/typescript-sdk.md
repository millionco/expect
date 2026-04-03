# Expect TypeScript SDK

Published as `expect-sdk` on npm. Used by coding agents (Claude Code, Codex, Gemini CLI, Copilot, Cursor, OpenCode, Droid) to run browser tests, and by the Expect CLI as its execution layer. Inspired by [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview).

## Design Principles

1. **Within distribution** - Agents should one-shot the SDK without additional documentation. APIs use familiar shapes from Playwright and the Claude Agent SDK so models generate correct code from training data alone. Strong types enforce correct usage at compile time.
2. **Interoperable with Playwright** - Setup and teardown accept `string` (AI-driven) or `(page: Page) => Promise<void | string>` (Playwright callback). `Cookie` is re-exported directly from Playwright. Use Playwright for deterministic setup, AI for fuzzy verification. Incrementally adoptable alongside existing test suites.
3. **Composable primitives** - `Expect.test()`, `Expect.session()`, and `Expect.cookies()` compose into arbitrarily complex test scenarios through plain JavaScript. Sessions persist browser state. Cookies extract and merge via arrays. No DSL, composition is just code.
4. **Effect inside, promises outside** - The SDK is written in Effect internally (`Effect.fn`, `Stream`, proper error handling) but exposes a plain `Promise`/`AsyncIterable` API to external consumers. The `expect-sdk/effect` subpath export gives Effect-native access for the CLI.

---

## Entry Points

The SDK ships two subpath exports:

- `**expect-sdk`** (`src/index.ts`) - Public API for external consumers. `Expect.test()`, `Expect.session()`, `Expect.cookies()`, `tool()`, `defineConfig`, `configure`, `ExpectConfigError`. No Effect types in the public surface. `Expect` is also the default export.
- `**expect-sdk/effect`** (`src/effect.ts`) - Effect-native API for internal consumers (the CLI). Exposes `layerSdk`, `ExpectTimeoutError`, `ExpectConfigError`, `resolveUrl`, `buildInstruction`, `buildTestResult`, `buildStepResult`, `diffEvents`, and re-exports key types.

```ts
// External consumer
import Expect from "expect-sdk";
import { Expect, tool, defineConfig, configure } from "expect-sdk";

// Internal consumer (CLI)
import { layerSdk, ExpectTimeoutError } from "expect-sdk/effect";
```

---

## API

### Types

```ts
import type { Page, BrowserContext, Cookie } from "playwright";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";

type Action = string | ((page: Page) => Promise<void | string>);
type BrowserName = "chrome" | "firefox" | "safari" | "edge" | "brave" | "arc";
type CookieInput = true | BrowserName | BrowserName[] | Cookie[];
type Test = string | { title?: string; prompt: string };

// Cookie is re-exported from Playwright directly
type Cookie = import("playwright").Cookie;

// Tool extends MCP Tool with a handler
interface Tool extends Pick<McpTool, "name" | "description" | "inputSchema"> {
  readonly handler: (input: Record<string, unknown>) => Promise<string>;
}

interface TestResult {
  readonly status: "pending" | "passed" | "failed";
  readonly url: string;
  readonly duration: number;
  readonly recordingPath?: string;
  readonly steps: StepResult[];
  readonly errors: StepResult[];
}

interface StepResult {
  readonly title: string;
  readonly status: "pending" | "passed" | "failed";
  readonly summary: string;
  readonly screenshotPath?: string;
  readonly duration: number;
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

One-shot test. Creates a browser, runs tests, closes. Returns a `TestRun` that is both `PromiseLike<TestResult>` and `AsyncIterable<TestEvent>`.

```ts
interface TestInput {
  readonly url?: string;
  readonly page?: Page;
  readonly cookies?: CookieInput;
  readonly tools?: Tool[];
  readonly tests: Test[];
  readonly setup?: Action;
  readonly teardown?: Action;
  readonly mode?: "headed" | "headless";
  readonly timeout?: number;
  readonly isRecording?: boolean;
}
```

Basic usage:

```ts
const result = await Expect.test({
  url: "http://localhost:3000/login",
  tests: [
    "signing in with valid credentials redirects to the dashboard",
    "invalid credentials show an error message",
  ],
});
```

Detailed prompts:

```ts
const result = await Expect.test({
  url: "http://localhost:3000/dashboard",
  tests: [
    "sidebar navigation works",
    {
      title: "dashboard loads correctly",
      prompt:
        "verify the user's name appears in the header, sidebar shows Settings/Projects/Team, no loading spinners remain after 3 seconds, no console errors",
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

Setup and teardown:

```ts
await Expect.test({
  url: "/admin",
  cookies: "chrome",
  setup: async (page) => {
    await page.fill("#email", "admin@test.com");
    await page.click("button[type=submit]");
    await page.waitForURL("/dashboard");
  },
  tests: ["admin can create a new user and see them in the table"],
  teardown: "delete any users created during this test",
});
```

Parallel execution:

```ts
const [login, signup] = await Promise.all([
  Expect.test({ url: "/login", tests: ["login page loads"] }),
  Expect.test({ url: "/signup", tests: ["signup page loads"] }),
]);
```

### `Expect.session(config): ExpectSession`

Persistent browser context. Call `.test()` for each batch. Each gets a fresh page, but cookies and localStorage persist. Call `.close()` when done.

```ts
interface SessionConfig {
  readonly url?: string;
  readonly browserContext?: BrowserContext;
  readonly cookies?: CookieInput;
  readonly tools?: Tool[];
  readonly hooks?: SessionHooks;
  readonly mode?: "headed" | "headless";
  readonly timeout?: number;
  readonly isRecording?: boolean;
}

interface SessionHooks {
  readonly beforeAll?: Action;
  readonly afterAll?: Action;
  readonly beforeEach?: Action;
  readonly afterEach?: Action;
}

interface ExpectSession {
  test(input: SessionTestInput): TestRun;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

interface SessionTestInput {
  readonly url?: string;
  readonly tests: Test[];
  readonly setup?: Action;
  readonly teardown?: Action;
  readonly mode?: "headed" | "headless";
  readonly timeout?: number;
  readonly isRecording?: boolean;
}
```

```ts
const session = Expect.session({ url: "http://localhost:3000", cookies: "chrome" });
await session.test({ url: "/login", tests: ["login works"] });
await session.test({ url: "/dashboard", tests: ["dashboard loads while authenticated"] });
await session.close();
```

### `tool(name, description, schema, handler): Tool`

Creates a custom tool the AI agent can call during test execution. Schema follows the MCP `Tool.inputSchema` format. Accepts raw JSON Schema objects or any schema library with a `toJsonSchema()` method.

```ts
const createUser = tool(
  "create_user",
  "Create a test user",
  { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
  async (input) => {
    const user = await db.users.create({ email: input.email as string });
    return `Created user ${user.id}`;
  },
);
```

### `Expect.cookies(browser): Promise<Cookie[]>`

Extracts cookies from a local browser profile. Returns a Playwright-compatible `Cookie[]`.

```ts
const chrome = await Expect.cookies("chrome");
await Expect.test({
  url: "/dashboard",
  cookies: [...chrome, { name: "api_token", value: "xyz", domain: ".example.com", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
  tests: ["dashboard loads with auth"],
});
```

Shorthand on `TestInput`:

```ts
await Expect.test({ url: "/dashboard", cookies: "chrome", tests: ["loads"] });
await Expect.test({ url: "/dashboard", cookies: true, tests: ["loads"] });
```

### `defineConfig(config): ExpectConfig`

Identity function for type inference in `expect.config.ts` files.

### `configure(config): void`

Shallow-merges partial config into global state. Inline alternative to config files.

```ts
interface ExpectConfig {
  readonly baseUrl?: string;
  readonly browser?: BrowserName;
  readonly mode?: "headed" | "headless";
  readonly cookies?: CookieInput;
  readonly timeout?: number;
  readonly model?: string;
  readonly apiKey?: string;
  readonly rootDir?: string;
}
```

### Error types

- `**ExpectConfigError**` (extends `Error`) - Thrown synchronously for invalid input (missing URL, empty tests, relative URL without baseUrl). Includes a `Fix:` line in the message with suggested corrections.
- `**ExpectTimeoutError**` (`Schema.ErrorClass`) - Thrown when a test exceeds its timeout. Has `timeoutMs` field.

---

## Architecture

Package at `packages/typescript-sdk/`, published as `expect-sdk`.

```
expect-cli (apps/cli)
  |- expect-sdk/effect (layerSdk as base of layerCli)
  |- @expect/supervisor (plan generation, flow storage, watch mode, git)

expect-sdk (packages/typescript-sdk)
  |- @expect/supervisor (Executor)
       |- @expect/agent (LLM via ACP)
       |- @expect/browser (Playwright + MCP)
       |- @expect/cookies (browser profile extraction)
       |- @expect/shared (domain models)
```

### Internal structure


| File                       | Responsibility                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`             | Public entry point (`expect-sdk`). Exports `Expect`, `tool`, `configure`, `defineConfig`, types.              |
| `src/effect.ts`            | Effect entry point (`expect-sdk/effect`). Exports `layerSdk`, errors, result builders.                        |
| `src/expect.ts`            | Core `Expect.test()`, `Expect.session()`, `Expect.cookies()` implementations. Effect inside, Promise outside. |
| `src/types.ts`             | All public TypeScript types. `Cookie` re-exported from Playwright, `Tool` extends MCP `Tool`.                 |
| `src/config.ts`            | `defineConfig`, `configure`, `getGlobalConfig`, `resetGlobalConfig`. Pure state management.                   |
| `src/tool.ts`              | `tool()` factory. Extracts `toJsonSchema()` if available.                                                     |
| `src/layers.ts`            | `layerSdk` - composes Executor + Git + Agent layers for Effect consumers.                                     |
| `src/result-builder.ts`    | Maps `ExecutedTestPlan` events to `TestResult`/`StepResult`/`TestEvent`. Pure functions.                      |
| `src/test-run.ts`          | `createTestRun` - dual `PromiseLike` + `AsyncIterable` wrapper.                                               |
| `src/build-instruction.ts` | `resolveUrl` and `buildInstruction` - URL resolution and prompt construction.                                 |
| `src/errors.ts`            | `ExpectConfigError` and `ExpectTimeoutError`.                                                                 |
| `src/constants.ts`         | `DEFAULT_TIMEOUT_MS` (5 min), `DEFAULT_AGENT_BACKEND` ("claude").                                             |


### Ownership

What the SDK owns:

- Test execution (wraps `Executor.execute` stream internally via `Effect.fn`)
- Config resolution (`defineConfig`, `configure`, `baseUrl`)
- URL resolution, instruction building
- Timeout handling (`ExpectTimeoutError`)
- Cookie resolution (via `@expect/cookies` with `Cookies.layer` + `layerLive`)
- Result building (`TestResult` from `ExecutedTestPlan` events, using `Map` for O(1) step lookups)
- `TestEvent` stream (maps internal events to public `TestEvent` union via `diffEvents`)
- Browser lifecycle (one-shot auto-close, session manual close)
- Layer composition for Effect consumers (`layerSdk` via `expect-sdk/effect`)
- Input validation (throws `ExpectConfigError` for unimplemented features: tools, hooks, browserContext)

What the CLI owns (uses supervisor directly, composes on `layerSdk`):

- Plan generation from git diffs
- Flow storage and caching (`FlowStorage`)
- Watch mode (`Watch`)
- Interactive TUI (Ink rendering of `TestEvent` stream)
- Replay proxy, live view push
- Analytics / telemetry
- Video generation (`RrVideo`)
- GitHub Actions integration
- `Reporter.report` (post-execution summary)

---

## Implementation Status

### Implemented (v1)

- `Expect.test()` with full execution pipeline
- `Expect.session()` (creates session, each `.test()` runs independently)
- `Expect.cookies()` (extracts via `@expect/cookies` with `Browsers.list` + `Cookies.extract`)
- `tool()` factory with MCP `inputSchema` format
- `defineConfig` / `configure` / `resetGlobalConfig`
- `TestRun` dual interface (PromiseLike + AsyncIterable)
- `TestEvent` streaming via event buffer with async iterator
- Result building with `Map`-based step lookups
- `ExpectConfigError` and `ExpectTimeoutError`
- `expect-sdk/effect` subpath with `layerSdk`
- CLI `layerCli` composes on `layerSdk` (no duplicate Executor/Git/Agent wiring)
- CLI uses `ExpectTimeoutError` from SDK (no duplicate error class)
- Default export (`import Expect from "expect-sdk"`)
- Input validation: empty tests, missing URL, unimplemented features

### Not yet implemented (v1 gaps)

- Custom tools wiring (accepted in types, throws at runtime)
- Session hooks (accepted in types, throws at runtime)
- External `browserContext` passthrough (accepted in types, throws at runtime)
- `isRecording` passthrough to executor
- Session shared browser state (each `.test()` currently runs independently)
- Function setup return value as AI context
- Config file auto-loading (`expect.config.ts`)

### Non-goals (v1)

- Test generation from diffs (that's the CLI)
- Interactive TUI / plan review
- Watch mode
- Imperative matchers (`toContainText`, etc.)
- Dev server lifecycle management

---

## Test Coverage

### Unit tests (61 tests, 7 files)

#### URL resolution (`build-instruction.test.ts`)

- Absolute URLs pass through unchanged (http, https)
- Relative URLs resolve against baseUrl (with/without leading slash)
- Trailing slash on baseUrl is normalized
- baseUrl ignored for absolute URLs
- Non-string URL throws with `Fix:` line
- Relative URL without baseUrl throws with `Fix:` line

#### Instruction building (`build-instruction.test.ts`)

- Single and multiple tests numbered correctly
- Tests included as numbered list

#### Config (`config.test.ts`)

- `defineConfig` returns same reference
- `configure` merges successive calls
- Later values override earlier ones
- `resetGlobalConfig` clears all values

#### Tool (`tool.test.ts`)

- Creates tool with name, description, inputSchema, handler
- Handler receives input and returns string
- Tools compose via arrays
- Extracts `toJsonSchema()` if available on schema object

#### Result building (`result-builder.test.ts`)

- `StepCompleted` events map to `"passed"`
- `StepFailed` and `StepSkipped` events map to `"failed"`
- Steps with no matching event default to `"pending"`
- `status` is "passed" only when all steps passed
- `status` is "failed" when any step failed
- `status` is "pending" while execution is in progress or no steps exist
- `errors` equals `steps.filter(s => s.status === "failed")`
- `diffEvents` emits `run:started`, `step:started`, `step:passed`, `step:failed`, `step:skipped`, `screenshot`, `completed`
- `diffEvents` only emits new events since previous snapshot
- Screenshot detection via `__screenshot` tool name suffix

#### TestRun (`test-run.test.ts`)

- `await run` resolves to `TestResult`
- `for await (const event of run)` yields `TestEvent`s in order
- Iterating and awaiting the same `TestRun` both work

#### Input validation (`expect.test.ts`)

- Throws for empty tests array
- Throws when no URL and no baseUrl
- Throws for relative URL without baseUrl
- Does not throw when baseUrl is configured
- Uses baseUrl when no URL provided
- Throws when tools are provided (not yet implemented)
- Session creation returns test/close/asyncDispose methods
- Session throws for hooks, browserContext, tools (not yet implemented)
- Default export matches named export

#### Example patterns (`examples.test.ts`)

- Absolute URL resolves correctly
- Configure baseUrl resolves relative URLs
- Session creates with expected methods
- Instruction builds numbered test list
- Cookies function is callable

### E2e tests (`tests/e2e.test.ts`)

Runs via `bun` against `tests/fixtures/fixture-server.ts` (static HTML server on random port). Requires a coding agent (Claude Code) installed. Run with `pnpm test:e2e`.

- Basic test: page loads and passes
- Streaming: events received via `for await`
- Login page: form field verification
- Configure baseUrl: relative URL resolution
- Session: sequential tests with shared context

---

## Decisions

- **Two functions, two responsibilities.** `Expect.test()` runs tests (one-shot, auto-closes browser). `Expect.session()` manages browser lifecycle (persistent, manual close). No overloads, no dual modes.
- `**Cookie` is Playwright's type.** Re-exported directly from `playwright`, not a custom interface. Ensures full compatibility.
- `**Tool` extends MCP `Tool`.** Uses `Pick<McpTool, "name" | "description" | "inputSchema">` from `@modelcontextprotocol/sdk` plus a `handler`. Schema shape comes from the MCP spec.
- **Effect inside, promises outside.** Internal code uses `Effect.fn`, `Stream.tap`, `Effect.forEach`. Public API is `Promise`/`AsyncIterable`. The `expect-sdk/effect` subpath gives Effect-native access for the CLI.
- `**errors` is derived.** Always `steps.filter(s => s.status === "failed")`.
- `**TestRun` is both promise and async iterable.** `await` gives `TestResult`. `for await` streams `TestEvent`s.
- **CLI composes on `layerSdk`.** The CLI uses `layerSdk` as the base of `layerCli` instead of manually wiring Executor + Git + Agent layers. Avoids duplicate service construction.
- **Plan generation stays in supervisor.** The SDK doesn't know about plans or diffs.
- **Parallel execution.** Sequential by default. Parallel via `Promise.all` on the caller side.
- **Unimplemented features throw early.** Tools, hooks, and browserContext are accepted in types but throw `ExpectConfigError` at runtime until implemented. This prevents silent no-ops.
- `**BrowserName` is a plain union.** Not derived from `@expect/cookies` `BrowserKey`. The SDK's 6 well-known browser names are the public surface.

