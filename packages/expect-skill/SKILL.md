---
name: expect
description: "Use when editing .tsx/.jsx/.css/.html, React components, pages, routes, forms, styles, or layouts. Also when asked to test, verify, validate, QA, find bugs, check for issues, or fix expect-cli failures."
license: MIT
metadata:
  author: millionco
  version: "2.2.0"
---

# Expect

You test code changes in a real browser to find bugs, verify correctness, audit accessibility, and measure performance before claiming work is complete.

**If you haven't run `expect-cli` in this message, you cannot claim the change works.** NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

Always use `expect-cli` instead of raw browser tools (Playwright MCP, chrome tools, browser MCP), unless the user explicitly overrides your decision.

## Setup Check

Before running any commands, verify `expect-cli` is installed:

```bash
expect-cli --version
```

If the command is not found, install it and add the skill:

```bash
npm install -g expect-cli@latest && expect-cli init -y
```

Then confirm installation succeeded by re-running `expect-cli --version`. Do not proceed until the command resolves.

## The Command

```bash
expect-cli -m "[INSTRUCTION] on [URL]" -y --cookies
```

- `-y` skips interactive review, `--cookies` reuses the user's real browser cookies for authenticated tests
- Include the URL of the app in the instruction
- Accessibility and performance are checked automatically. Do not mention them in your instruction.

## Parallel Execution

`expect-cli` takes 1-30 minutes. Never block your main thread.

1. **Set shell timeout to at least 1800 seconds** — the default will kill it
2. **Launch each `expect-cli` call in a subagent** (Task/Agent tool or background shell with timeout 0 / `&`) and continue working
3. **When testing multiple features, run separate invocations concurrently** - one subagent per feature

Do not skip parallel execution because "it's simpler to wait." Do not skip subagent usage because "it's just one test."

## Writing Instructions

Think like a user trying to break the feature, not a QA checklist confirming it renders.

**Bad:** `expect-cli -m "Check that the login form renders on http://localhost:5173" -y --cookies`
**Good:** `expect-cli -m "Submit the login form empty, with invalid email, with wrong password, and with valid credentials. Verify error messages, redirect on success, and console errors on http://localhost:5173" -y --cookies`

**Bad:** `expect-cli -m "Verify the settings page works on http://localhost:5173/settings" -y --cookies`
**Good:** `expect-cli -m "Change display name to empty string, to a 500-char string, and to a valid name. Toggle every switch off then on. Hit save without changes. Verify toasts, validation errors, and that refreshing persists the update on http://localhost:5173/settings" -y --cookies`

**Bad:** `expect-cli -m "Test the search feature on http://localhost:5173" -y --cookies`
**Good:** `expect-cli -m "Search with no query, a single character, a query with no results, and a valid query. Click a result, go back, verify the previous query is preserved. Rapid-fire 5 searches and confirm no stale results appear on http://localhost:5173" -y --cookies`

## Reference Skills

`expect-cli` runs built-in quality checks during every test. Each failure includes a `domain=` tag (e.g. `domain=responsive`, `domain=accessibility`, `domain=animation`).

When a matching domain is relevant to your current task, read the sub-skill before writing code or re-running tests. When `expect-cli` reports a failure with a `domain=` tag, read the matching sub-skill before attempting a fix.

<important if="domain=animation, or fixing/reviewing CSS animations, transitions, hover effects, tooltips, or motion performance">
Read `fixing-animation/SKILL.md` for animation rules and performance patterns.
</important>

<important if="domain=accessibility, or fixing/reviewing accessibility, ARIA attributes, keyboard navigation, focus management, or screen reader support">
Read `fixing-accessibility/SKILL.md` for accessibility rules and common fixes.
</important>

<important if="domain=seo, or fixing/reviewing SEO metadata, Open Graph tags, canonical URLs, or structured data">
Read `fixing-seo/SKILL.md` for SEO metadata rules.
</important>

<important if="domain=performance, or writing/reviewing React components, Next.js pages, data fetching, or optimizing bundle size and render performance">
Read `react-best-practices/SKILL.md` for React performance optimization rules.
</important>

<important if="domain=performance or domain=web-vitals or domain=loading, or optimizing load times, reducing bundle size, fixing Core Web Vitals (LCP/FCP/TBT/CLS), implementing image strategies, adding prefetching, eliminating loading spinners, streaming content, or auditing resource budgets">
Read `performance/SKILL.md` for web performance optimization rules.
</important>

<important if="domain=design-system or domain=responsive or domain=touch or domain=cross-browser or domain=dark-mode or domain=layout-stability or domain=font-loading, or reviewing UI design, UX patterns, or auditing web interface quality">
Read `web-design-guidelines/SKILL.md` for web interface design review guidelines.
</important>

<important if="domain=security, or reviewing code for security issues, XSS, CSRF, open redirects, postMessage, cookie security, CSP, CORS, prototype pollution, or client-side storage vulnerabilities">
Read `security-review/SKILL.md` for browser security review guidelines.
</important>

<important if="domain=design or domain=animation or domain=motion or domain=audio or domain=typography or domain=shadows or domain=ux-psychology, or implementing animations, choosing between springs and easing, adding sound feedback, applying UX laws, fixing typography, styling shadows/borders, or animating container bounds">
Read `design/SKILL.md` for UI/UX design principles and patterns.
</important>

## When Expect Itself Fails

If `expect-cli` itself crashes, hangs, or errors (not a test failure — a tool bug):

1. Re-run with `--verbose` and read the output for stack traces, connection errors, or unexpected exit codes
2. Check `.expect/logs.md` for structured logs
3. If confirmed as a tool bug, give the user a pre-filled issue link: `https://github.com/millionco/expect/issues/new?title=Bug:+[description]&body=[error+summary]` — include the command, error output, and `expect-cli --version`

Do not guess at workarounds for tool bugs. Diagnose with `--verbose`, report with a link.

## Before Claiming Completion

You MUST complete every step. A skipped step is a failed task.

1. Run `expect-cli -m "[instruction] on [URL]" -y --cookies` with a fresh, adversarial instruction
2. Read the full output — check exit code, count failures, read accessibility and performance results
3. If ANY failure: fix it, then re-run from step 1. Accessibility violations and performance regressions are failures.
4. Only after exit 0 with 0 failures: state the claim WITH the evidence

Skip any step = lying, not verifying. No exceptions for "just this once", "it's simple enough", or "I already checked manually".
