---
name: expect
description: "Use when editing .tsx/.jsx/.css/.html, React components, pages, routes, forms, styles, or layouts. Also when asked to test, verify, validate, QA, find bugs, check for issues, or fix expect-cli failures."
license: MIT
metadata:
  author: millionco
  version: "2.4.0"
---

# Expect

You verify code changes in a real browser before claiming they work. No browser evidence, no completion claim.

Use the expect MCP tools (`open`, `playwright`, `screenshot`, etc.) for all browser interactions. Do not use raw browser tools (Playwright MCP, chrome tools, etc.) unless the user explicitly asks.

## Subagent Usage

Browser verification is best run in a subagent (Task tool) or background shell so the main thread stays free for code edits. This keeps the conversation responsive — you can fix code while the browser test runs in parallel. Strongly prefer launching a subagent for browser work, especially when the test involves multiple steps or long interactions. If the test is truly trivial (single screenshot check), inline is acceptable.

## Resuming Browser State

Before opening a new browser, check if one is already running. Use `browser_tabs` (action `list`) or the expect `screenshot` tool to see if a session is still active. If a tab is already open at the target URL, reuse it — don't close and reopen. When re-verifying after a code fix, prefer navigating or refreshing the existing session over starting from scratch.

## Compounding

The `playwright` tool takes a `code` string with `ref()` to resolve snapshot refs to Locators. One call can do an entire interaction — fills, clicks, AND data collection. Use that.

**BAD — 5 tool calls:**

```
screenshot (snapshot)
playwright: await ref('e3').fill('Jane')
screenshot (snapshot)                        ← WHY? page didn't change
playwright: await ref('e5').fill('jane@example.com')
playwright: await ref('e7').click()
```

**GOOD — 2 tool calls:**

```
screenshot (snapshot)
playwright (snapshotAfter=true):
  await ref('e3').fill('Jane');
  await ref('e5').fill('jane@example.com');
  await ref('e7').click();
  return { title: await page.title(), url: page.url(), errors: (await page.$$('.error')).length };
```

Use `return` to collect data. Response: `{ result: <value>, resultFile: "<tmp path>", snapshot: { tree, refs, stats } }`. The `resultFile` persists until `close` — read or grep it later. Without a return value, responds `"OK"` (or just the snapshot if `snapshotAfter=true`).

**Re-snapshot only across DOM boundaries.** Fills and hovers don't change page structure — keep using the same refs. Navigation, submit, dialog open/close DO change structure — set `snapshotAfter=true`.

## Writing Instructions

**Bad:** `"Check that the login form renders on http://localhost:5173"`
**Good:** `"Submit the login form empty, with invalid email, with wrong password, and with valid credentials. Verify error messages, redirect on success, and console errors on http://localhost:5173"`

## Before Claiming Completion

1. Verify in a browser with adversarial instructions.
2. Read the full output — check failures, accessibility, performance.
3. If ANY failure: fix the code, re-verify immediately. No asking, no waiting.
4. Repeat until 0 failures, then state the claim with passing evidence.

## Rationalizations

- "I'll run the browser test inline, it's quick" — Probably not. Launch a subagent so you can keep editing code in parallel. Only skip the subagent for a single screenshot sanity check.
- "I'll open a fresh browser to re-test" — Check for an existing session first. If the tab is still open, refresh or navigate — don't waste time on a cold start.
- "I'll make one `playwright` call per action" — No. Whole sequence in one call.
- "I need a snapshot between fills" — No. Fills don't change DOM. Batch them.
- "Let me snapshot to see what changed" — Did the page navigate or submit? No? Use `snapshotAfter=true` on the action that does.
