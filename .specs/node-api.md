# Node API

Programmatic API for Expect. Coding agents write natural-language browser assertions, Expect validates them against a live browser.

**Primary user:** Coding agents (Claude Code, Codex CLI, Cursor). Human asks "verify my changes work," agent writes + runs Expect code.

---

## Design Principles

1. **Agent-first.** Optimized for LLM authorship. An agent writes correct code on the first try.
2. **In-distribution.** Types with JSDoc + a skill file ship inside the package.
3. **Declarative.** You say _what_ to verify, not _how_ to click.

---

## API

One function. One matcher. `expect(target).toPass(requirements)`.

### Simple case

```ts
import { expect } from "expect";

await expect("http://localhost:3000/login").toPass([
  "signing in with valid credentials redirects to the dashboard",
  "invalid credentials show an error message",
]);
```

### Target object

`expect()` accepts a URL string or a target object with shared context:

```ts
await expect({
  url: "/login",
  data: { email: "test@example.com", password: "password123" },
}).toPass([
  "signing in with valid credentials redirects to the dashboard",
  "invalid credentials show an error message",
]);
```

`data` on the target applies to all requirements in that `.toPass()` call.

### Per-requirement context

Requirements can be strings (simple) or objects (with their own `data` that overrides the target):

```ts
await expect("/login").toPass([
  "forgot password link navigates to /reset-password",
  {
    requirement: "signing in with valid credentials redirects to the dashboard",
    data: { email: "test@example.com", password: "password123" },
  },
  {
    requirement: "invalid credentials show an error message",
    data: { email: "wrong@example.com", password: "badpassword" },
  },
  {
    requirement: "shows a maintenance banner",
    data: "the app is in maintenance mode",
  },
]);
```

### Options

`.toPass()` takes an optional second argument for run-level config:

```ts
await expect("/login").toPass([...], {
  cookies: "chrome",
  isHeaded: true,
  timeout: 120_000,
  isRecording: true,
});
```

| Option        | What it does                                       |
| ------------- | -------------------------------------------------- |
| `cookies`     | Use real auth cookies from a local browser profile |
| `isHeaded`    | Show the browser window (for debugging)            |
| `timeout`     | Override the default 5-minute timeout              |
| `isRecording` | Save an rrweb session recording                    |

### Playwright interop

Pass a Playwright `page` instead of a URL:

```ts
import { test } from "@playwright/test";
import { expect } from "expect";

test("login flow", async ({ page }) => {
  await page.goto("http://localhost:3000/login");
  await page.fill("#email", "test@example.com");
  await page.fill("#password", "password123");
  await page.click("button[type=submit]");

  await expect(page).toPass(["redirected to the dashboard", "shows the user's name in the header"]);
});
```

`expect(url)` or `expect({ url, data })` — Expect manages the browser. `expect(page)` — Playwright manages the browser, Expect just validates.

### Structured results

`.toPass()` always resolves (never throws) with `ExpectResult`:

```ts
const result = await expect("/login").toPass([
  "signing in with valid credentials redirects to the dashboard",
  "invalid credentials show an error message",
]);

result.isPassed; // boolean
result.url; // "http://localhost:3000/login"
result.duration; // ms
result.recordingPath; // path to recording (if isRecording: true)
result.steps[0].requirement; // the requirement string
result.steps[0].status; // "passed" | "failed" | "skipped"
result.steps[0].summary; // AI explanation of what happened
result.steps[0].screenshotPath; // path to screenshot
result.steps[0].duration; // ms
```

`npx expect --json` writes the same structure to stdout.

---

## Configuration

Config file or inline. Both use the same shape. Inline overrides file.

```ts
// expect.config.ts
import { defineConfig } from "expect";

export default defineConfig({
  baseUrl: "http://localhost:3000",
  browser: "chromium",
  isHeadless: true,
  cookies: "chrome", // or { source: "chrome", profile: "Profile 1" }
});
```

```ts
// Inline (no config file needed)
import { configure, expect } from "expect";
configure({ baseUrl: "http://localhost:3000" });
```

---

## API Surface

```ts
export function expect(target: string | ExpectTarget | PlaywrightPage): ExpectChain;

interface ExpectTarget {
  url: string;
  data?: string | Record<string, unknown>;
}

type Requirement = string | { requirement: string; data: string | Record<string, unknown> };

interface ExpectChain {
  toPass(requirements: Requirement | Requirement[], options?: ToPassOptions): Promise<ExpectResult>;
}

interface ToPassOptions {
  cookies?: string;
  isHeaded?: boolean;
  timeout?: number;
  isRecording?: boolean;
}

interface ExpectResult {
  isPassed: boolean;
  url: string;
  duration: number;
  recordingPath?: string;
  steps: StepResult[];
}

interface StepResult {
  requirement: string;
  status: "passed" | "failed" | "skipped";
  summary: string;
  screenshotPath?: string;
  duration: number;
}

export function defineConfig(options: ExpectConfig): ExpectConfig;
export function configure(options: Partial<ExpectConfig>): void;

interface ExpectConfig {
  baseUrl?: string;
  browser?: "chromium" | "firefox" | "webkit";
  isHeadless?: boolean;
  cookies?: string | CookieConfig;
  timeout?: number;
  model?: string;
  apiKey?: string;
  startCommand?: string;
}

interface CookieConfig {
  source: string;
  profile?: string;
}
```

---

## Architecture

New package at `packages/node-api/`, published as `expect` on npm. Thin wrapper — no business logic.

```
expect("/login").toPass(["signing in redirects"])
  → resolve URL against baseUrl
  → build TestPlan (one TestPlanStep per requirement)
  → Executor.execute(plan)
  → fold stream into ExpectResult
  → return Promise<ExpectResult>
```

```
expect (packages/node-api)
  └─ @expect/supervisor (Executor, Reporter)
       ├─ @expect/agent (LLM streaming)
       ├─ @expect/browser (Playwright + MCP)
       ├─ @expect/cookies (auth extraction)
       └─ @expect/shared (models)
```

Does NOT depend on the CLI or Ink.

Public API is pure promises. `ManagedRuntime` bridges into Effect internally.

`npx expect` runner: loads test files, executes `toPass()` calls, prints output, exits 0/1.

---

## Distribution

Ships a `SKILL.md` in the package root. One file, one source of truth. Agents pick it up via `.claude/skills/`, Cursor rules, or Codex context.

Every public symbol gets JSDoc with `@example`. Types alone should be enough.

Error messages include a `Fix:` line with exact code to write:

```
ExpectConfigError: No baseUrl configured and URL "/login" is relative.

Fix: configure({ baseUrl: "http://localhost:3000" })
Or use a full URL: expect("http://localhost:3000/login").toPass([...])
```

Defaults: `isHeadless: true`, `browser: "chromium"`, API key from `ANTHROPIC_API_KEY`, 5-minute timeout.

---

## Decisions

- **Browser reuse:** Shared browser process, fresh context per `toPass()` — like Playwright's `browser.newContext()`. Isolation without cold-start cost.
- **Parallel execution:** Sequential by default. Each `toPass()` runs one at a time. Parallel is possible via `Promise.all` but not optimized for v1 (concurrent LLM calls, memory, rate limits).
- **Dev server:** Optional `startCommand` in config. If set, `npx expect` runs it before tests and kills it after. Waits for `baseUrl` to be reachable before starting tests.

```ts
export default defineConfig({
  baseUrl: "http://localhost:3000",
  startCommand: "npm run dev",
});
```

---

## Non-goals (v1)

- Test generation from diffs (that's the CLI)
- Interactive TUI
- Watch mode
- Plan review/approval
- Imperative matchers (`toContainText`, etc. — that's Playwright)
