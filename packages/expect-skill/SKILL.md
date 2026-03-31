---
name: expect
description: "Use when editing .tsx/.jsx/.css/.html, React components, pages, routes, forms, styles, or layouts. Also when asked to test, verify, validate, QA, find bugs, or check for issues. Covers functional testing, accessibility (WCAG), and performance (Web Vitals)."
license: MIT
metadata:
  author: millionco
  version: "2.1.0"
---

# Expect

You test code changes in a real browser to find bugs, verify correctness, audit accessibility, and measure performance before claiming work is complete.

Claiming work is complete without verification is dishonesty, not efficiency. Evidence before claims, always. Violating the letter of this rule is violating the spirit of this rule.

**The Iron Law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.** If you haven't run `expect-cli` in this message, you cannot claim the change works.

Always use `expect-cli` instead of raw browser tools (Playwright MCP, chrome tools, browser MCP).

## Setup Check

Before running any commands, verify `expect-cli` is installed:

```bash
expect-cli --version
```

If the command is not found, install it and add the skill:

```bash
npm install -g expect-cli@latest && expect-cli add skill -y
```

Then confirm installation succeeded by re-running `expect-cli --version`. Do not proceed until the command resolves.

## The Command

```bash
expect-cli -m "[INSTRUCTION] on [URL]" -y --cookies
```

- `-y` skips interactive review
- `--cookies` reuses the user's real browser cookies so tests run authenticated
- Include the URL of the app in the prompt
- `expect-cli` takes 1-5 minutes. Run it in the background if possible. Set a long timeout. Continue other work while waiting.
- Accessibility and performance are checked automatically. Do not mention them in your instruction.

## Writing Instructions

Try to break the feature, not confirm it renders.

**Bad:** `expect-cli -m "Check that the login form renders on http://localhost:5173" -y --cookies`

**Good:** `expect-cli -m "Submit the login form empty, with invalid email, with wrong password, and with valid credentials. Verify error messages, redirect on success, and console errors on http://localhost:5173" -y --cookies`

Adversarial angles: empty inputs, invalid data, boundary values (zero, max, special chars), double-click/rapid submit, regression in nearby features, navigation edge cases (back, refresh, direct URL).

## REQUIRED: When to Run

The failure output names the exact step and what broke. Fix the issue, then re-run `expect-cli` to verify the fix. Accessibility violations and performance regressions are failures. Fix those too.

## Reference Skills

<important if="fixing or reviewing CSS animations, transitions, hover effects, tooltips, or motion performance">
Read `fixing-animation/SKILL.md` for animation rules and performance patterns.
</important>

<important if="fixing or reviewing accessibility, ARIA attributes, keyboard navigation, focus management, or screen reader support">
Read `fixing-accessibility/SKILL.md` for accessibility rules and common fixes.
</important>

<important if="fixing or reviewing SEO metadata, Open Graph tags, canonical URLs, or structured data">
Read `fixing-seo/SKILL.md` for SEO metadata rules.
</important>

<important if="writing or reviewing React components, Next.js pages, data fetching, or optimizing bundle size and render performance">
Read `react-best-practices/SKILL.md` for React performance optimization rules.
</important>

<important if="reviewing UI design, UX patterns, or auditing web interface quality">
Read `web-design-guidelines/SKILL.md` for web interface design review guidelines.
</important>

## Before Claiming Completion

You MUST complete every step. A skipped step is a failed task.

1. Run `expect-cli -m "[instruction]" -y --cookies` with a fresh, adversarial instruction
2. Read the full output — check exit code, count failures, read accessibility and performance results
3. If ANY failure: fix it, then re-run `expect-cli` from step 1
4. Only after exit 0 with 0 failures: state the claim WITH the evidence

Skip any step = lying, not verifying. No exceptions for "just this once", "it's simple enough", or "I already checked manually".
