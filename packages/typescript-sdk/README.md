# expect-sdk

**Expect** tests your app in a browser so you don't have to.

- Spawns agents simulating real logged-in users to find issues and regressions.
- No more writing Playwright by hand or token-hungry computer use tools.
- Get video recordings and GitHub Actions out of the box.

```ts
import { Expect } from "expect-sdk";

const result = await Expect.test({
  url: "http://localhost:3000/login",
  tests: ["valid credentials redirect to the dashboard"],
});
```

`expect-sdk` is the TypeScript SDK for [Expect](https://expect.dev). Use it when you need test results in code: CI scripts, test suites, custom tooling. Use [expect-cli](https://npmjs.com/package/expect-cli) for everything else.

## Install

```bash
npm install expect-sdk
```

## Set up

Expect works with any [supported coding agent](https://github.com/millionco/expect#supported-agents), including Claude Code, Codex, Gemini CLI, GitHub Copilot, Cursor, OpenCode, and Factory Droid. Install at least one:

```bash
npm install -g @anthropic-ai/claude-code   # default
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=your-api-key
```

The SDK uses Claude Code by default. See the [full list of supported agents](https://github.com/millionco/expect#supported-agents) for other providers and their setup instructions.

Playwright is an optional peer dependency, only needed for `page`/`browserContext` interoperability and function-based `setup`/`teardown`.

## Run your first test

```ts
import { Expect } from "expect-sdk";

const result = await Expect.test({
  url: "http://localhost:3000",
  tests: ["the homepage loads and shows a welcome heading"],
});

console.log(result.status); // "passed" or "failed"
```

The SDK launches a browser, navigates to your URL, and uses AI to verify each test. No test framework is required.

## Capabilities

### Tests as plain English

Tests are written as strings describing expected behavior. The AI agent handles navigation, interaction, and verification on your behalf.

```ts
await Expect.test({
  url: "http://localhost:3000/signup",
  tests: [
    "submitting empty form shows validation errors on all fields",
    "mismatched passwords show 'passwords do not match'",
    "valid submission redirects to the dashboard with welcome message",
  ],
});
```

### Detailed test prompts

For tests that need more context than a single sentence, use the `{ title, prompt }` object form. The `title` is displayed in results, and the `prompt` gives the AI detailed instructions:

```ts
await Expect.test({
  url: "http://localhost:3000/dashboard",
  tests: [
    "sidebar navigation works",
    {
      title: "dashboard data loads correctly",
      prompt:
        "verify the user's name appears in the header, the sidebar shows Settings/Projects/Team links, no loading spinners remain after 3 seconds, and there are no console errors",
    },
  ],
});
```

### Live streaming

`Expect.test()` returns a `TestRun`, which is both a `PromiseLike<TestResult>` and an `AsyncIterable<TestEvent>`. You can await it for the final result, or iterate over it for live progress updates:

```ts
const run = Expect.test({
  url: "http://localhost:3000",
  tests: ["login works", "dashboard loads"],
});

for await (const event of run) {
  if (event.type === "step:passed") console.log(`✅ ${event.step.title}`);
  if (event.type === "step:failed") console.log(`❌ ${event.step.title}`);
}

const result = await run;
```

### Playwright interoperability

You can use Playwright for deterministic setup steps and let the AI handle fuzzy verification. Pass a string for AI-driven actions, or a callback that receives the Playwright `Page`:

```ts
await Expect.test({
  url: "/admin",
  cookies: "chrome",
  setup: async (page) => {
    await page.fill("#email", "admin@test.com");
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard");
  },
  tests: ["admin panel shows user management table"],
  teardown: "delete any test data created during this test",
});
```

You can also pass an existing Playwright `Page` if you've already set up the browser yourself:

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

### Sessions

Sessions create a persistent browser context where cookies and localStorage carry across multiple `.test()` calls. Each call opens a fresh page within the same context.

```ts
const session = Expect.session({ url: "http://localhost:3000", cookies: "chrome" });

await session.test({ url: "/login", tests: ["login form loads"] });
await session.test({ url: "/dashboard", tests: ["dashboard loads while authenticated"] });
await session.test({ url: "/settings", tests: ["settings page is accessible"] });

await session.close();
```

### Cookie extraction

`Expect.cookies()` extracts cookies from a local browser profile for authenticated testing. It returns a Playwright-compatible `Cookie[]` that you can spread into your test input.

```ts
const cookies = await Expect.cookies("chrome");

await Expect.test({
  url: "/dashboard",
  cookies: [
    ...cookies,
    {
      name: "feature_flag",
      value: "new_ui",
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ],
  tests: ["dashboard loads with authentication"],
});
```

As a shorthand, you can pass a browser name or `true` directly to `cookies` on `Expect.test()` instead of calling `Expect.cookies()` separately:

```ts
await Expect.test({ url: "/dashboard", cookies: "chrome", tests: ["loads"] });
await Expect.test({ url: "/dashboard", cookies: true, tests: ["loads"] });
```

### Custom tools

You can provide custom tools that the AI agent can call during test execution. This is useful for database setup, API calls, or any server-side action the agent needs to perform as part of a test.

```ts
import { tool } from "expect-sdk";

const createUser = tool(
  "create_user",
  "Create a test user in the database",
  { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
  async (input) => {
    const user = await db.users.create({ email: input.email as string });
    return `Created user ${user.id}`;
  },
);

await Expect.test({
  url: "/admin/users",
  tools: [createUser],
  tests: ["new user appears in the users table"],
});
```

### Configuration

`configure()` sets global defaults that apply to all subsequent `Expect.test()` and `Expect.session()` calls, so you don't need to repeat common options:

```ts
import { Expect, configure } from "expect-sdk";

configure({ baseUrl: "http://localhost:3000", mode: "headless" });

await Expect.test({ url: "/login", tests: ["login page loads"] });
await Expect.test({ url: "/signup", tests: ["signup page loads"] });
```

### Config file

For project-wide defaults, create an `expect.config.ts` file in your project root. The SDK automatically loads this file when running tests, so you don't need to call `configure()` in every test script.

```ts
// expect.config.ts
import { defineConfig } from "expect-sdk";

export default defineConfig({
  baseUrl: "http://localhost:3000",
  browser: "chrome",
  mode: "headless",
  cookies: "chrome",
  timeout: 120_000,
});
```

With this file in place, all `Expect.test()` calls resolve relative URLs against `baseUrl` and use Chrome cookies automatically:

```ts
// No need to specify baseUrl or cookies in each call
await Expect.test({ url: "/login", tests: ["login page loads"] });
await Expect.test({ url: "/signup", tests: ["signup page loads"] });
```

Inline `configure()` calls take precedence over config file values, so you can override specific options per-script when needed.

### Error handling

The SDK throws `ExpectConfigError` for invalid input (missing URL, empty tests array) and `ExpectTimeoutError` when a test exceeds its timeout. Both are exported from the package:

```ts
import { Expect, ExpectConfigError } from "expect-sdk";

try {
  const result = await Expect.test({
    url: "http://localhost:3000",
    tests: ["login works"],
    timeout: 60_000,
  });
  if (result.status === "failed") {
    console.error("Test failures:");
    for (const error of result.errors) {
      console.error(`  ${error.title}: ${error.summary}`);
    }
    process.exit(1);
  }
} catch (error) {
  if (error instanceof ExpectConfigError) {
    console.error("Configuration error:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
  process.exit(1);
}
```

### Parallel execution

Tests run sequentially by default. To run multiple tests in parallel, use `Promise.all` or `Promise.allSettled`:

```ts
const [login, signup, dashboard] = await Promise.all([
  Expect.test({ url: "/login", tests: ["login page loads"] }),
  Expect.test({ url: "/signup", tests: ["signup page loads"] }),
  Expect.test({ url: "/dashboard", tests: ["dashboard loads"] }),
]);
```

Each test launches its own browser instance, so they don't interfere with each other.

### CI/CD

The SDK works in any CI environment that has Node.js and a supported agent installed. Here's an example GitHub Actions workflow:

```yaml
# .github/workflows/expect.yml
name: Browser Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm install -g @anthropic-ai/claude-code
      - run: npm start & npx wait-on http://localhost:3000
      - run: npx tsx tests/browser.ts
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Where `tests/browser.ts` is a script that uses the SDK:

```ts
import { Expect, configure } from "expect-sdk";

configure({ baseUrl: "http://localhost:3000" });

const result = await Expect.test({
  url: "/login",
  tests: ["login form validates required fields", "valid credentials redirect to the dashboard"],
});

if (result.status === "failed") {
  console.error(result.errors.map((e) => e.summary).join("\n"));
  process.exit(1);
}
```

## Compare to other testing tools

|                | expect-sdk                      | Playwright / Cypress     | Manual QA      |
| -------------- | ------------------------------- | ------------------------ | -------------- |
| Test authoring | Plain English                   | Selectors + assertions   | Click around   |
| Maintenance    | Tests don't break on UI changes | Brittle selectors        | N/A            |
| Setup          | `npm install expect-sdk`        | Page objects, fixtures   | Hire people    |
| Flakiness      | AI retries intelligently        | Explicit waits           | Human judgment |
| Best for       | Behavior verification           | Pixel-precise assertions | Exploratory    |

Use expect-sdk when you care about **what** the app does. Use Playwright when you care about **how** it renders.

---

## API reference

### `Expect.test(input): TestRun`

Runs a one-shot test. The SDK launches a browser, navigates to the URL, executes all tests, and closes the browser when finished.

```ts
const result = await Expect.test({
  url: "http://localhost:3000/login",
  cookies: "chrome",
  tests: ["login form validates email", "valid credentials redirect to dashboard"],
  setup: "navigate to the login page",
  timeout: 60_000,
});
```

| Field         | Type          | Default      | Description                                                      |
| ------------- | ------------- | ------------ | ---------------------------------------------------------------- | ------------------ |
| `url`         | `string`      | -            | URL to navigate to (absolute or relative to `baseUrl`)           |
| `page`        | `Page`        | -            | Existing Playwright page (skips browser creation, `url` ignored) |
| `cookies`     | `CookieInput` | -            | `true`, browser name, browser name array, or `Cookie[]`          |
| `tools`       | `Tool[]`      | -            | Custom tools the AI can call                                     |
| `tests`       | `Test[]`      | **required** | Test descriptions as strings or `{ title?, prompt }` objects     |
| `setup`       | `Action`      | -            | String instruction or `(page: Page) => Promise<void              | string>`           |
| `teardown`    | `Action`      | -            | String instruction or `(page: Page) => Promise<void              | string>`           |
| `mode`        | `"headed"     | "headless"`  | `"headless"`                                                     | Browser visibility |
| `timeout`     | `number`      | `300000`     | Timeout in milliseconds                                          |
| `isRecording` | `boolean`     | `false`      | Enable session recording                                         |

### `TestRun`

The object returned by `Expect.test()`. It implements both `PromiseLike<TestResult>` and `AsyncIterable<TestEvent>`, so you can either await the final result or iterate over events as they stream in.

```ts
interface TestRun extends PromiseLike<TestResult> {
  [Symbol.asyncIterator](): AsyncIterator<TestEvent>;
}
```

### `TestResult`

The final result returned when a `TestRun` resolves.

```ts
interface TestResult {
  status: "pending" | "passed" | "failed";
  url: string;
  duration: number;
  recordingPath?: string;
  steps: StepResult[];
  errors: StepResult[]; // steps.filter(s => s.status === "failed")
}
```

### `StepResult`

Represents the outcome of a single test step within a run.

```ts
interface StepResult {
  title: string;
  status: "pending" | "passed" | "failed";
  summary: string;
  screenshotPath?: string;
  duration: number;
}
```

### `TestEvent`

Events emitted during test execution. Use `for await (const event of run)` to consume them:

```ts
type TestEvent =
  | { type: "run:started"; title: string; baseUrl?: string }
  | { type: "step:started"; title: string }
  | { type: "step:passed"; step: StepResult }
  | { type: "step:failed"; step: StepResult }
  | { type: "step:skipped"; title: string; reason: string }
  | { type: "screenshot"; title: string; path: string }
  | { type: "completed"; result: TestResult };
```

### `Expect.session(config): ExpectSession`

Creates a persistent browser context where cookies and localStorage are preserved across multiple `.test()` calls.

```ts
const session = Expect.session({
  url: "http://localhost:3000",
  cookies: "chrome",
  mode: "headless",
});

await session.test({ url: "/login", tests: ["login works"] });
await session.test({ url: "/dashboard", tests: ["loads while authenticated"] });
await session.close();
```

| Field     | Type          | Default     | Description                       |
| --------- | ------------- | ----------- | --------------------------------- | ------------------ |
| `url`     | `string`      | -           | Base URL for the session          |
| `cookies` | `CookieInput` | -           | Cookies to inject                 |
| `mode`    | `"headed"     | "headless"` | `"headless"`                      | Browser visibility |
| `timeout` | `number`      | `300000`    | Default timeout for session tests |

### `ExpectSession`

```ts
interface ExpectSession {
  test(input: SessionTestInput): TestRun;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}
```

### `Expect.cookies(browser): Promise<Cookie[]>`

Extracts cookies from a local browser profile and returns them as a Playwright-compatible `Cookie[]`.

```ts
const cookies = await Expect.cookies("chrome");
const multi = await Expect.cookies(["chrome", "firefox"]);
const autoDetect = await Expect.cookies(true);
```

### `tool(name, description, schema, handler): Tool`

Creates a custom tool that the AI agent can invoke during test execution. The schema follows the MCP tool input schema format.

```ts
import { tool } from "expect-sdk";

const createUser = tool(
  "create_user",
  "Create a test user",
  { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
  async (input) => `Created user ${input.email}`,
);
```

### `configure(config): void`

Sets global configuration defaults. Each call shallow-merges into the existing config, so you can call it multiple times to build up options incrementally.

```ts
import { configure } from "expect-sdk";
configure({ baseUrl: "http://localhost:3000", mode: "headless", timeout: 60_000 });
```

### `defineConfig(config): ExpectConfig`

An identity function that provides type inference when writing `expect.config.ts` files. It returns the config object unchanged.

```ts
import { defineConfig } from "expect-sdk";
export default defineConfig({ baseUrl: "http://localhost:3000", cookies: "chrome" });
```

### `ExpectConfig`

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

## License

FSL-1.1-MIT © [Million Software, Inc.](https://million.dev)
