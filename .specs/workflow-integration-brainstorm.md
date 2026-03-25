# Workflow Integration Brainstorm

How to make Expect native to a developer's workflow — not a separate step, but an embedded part of how code gets written, verified, and shipped.

## Integration Points

### Git Subcommand — `git expect`

Custom git subcommand that feels native to existing muscle memory.

- `git expect` — run against current unstaged diff
- `git expect main..HEAD` — run against branch diff
- `git expect --stake` — auto-push if passes, abort if fails

### Git Hooks

- **post-commit**: diff and suggest a test plan after every commit. User accepts/dismisses inline.
- **pre-push**: hard gate. "You changed auth flow, Expect found a regression, blocking push."
- Downside: hooks are local-only, fragile, users disable them.

### MCP Server

Expect as an MCP tool any agent (Claude Code, Cursor, Codex) can call:

```
expect.verify({ description: "login flow works after password validation change" })
```

Agents can call Expect mid-task, not just at the end. "Let me check if this works before I move on to the next file." Highest leverage because it works across all agents.

### Claude Code Skill / Slash Command

`/expect` that agents invoke naturally. Agent already knows what it changed and why — can generate a targeted test plan without diffing.

### Cursor/Windsurf Rules Injection

Ship `.cursor/rules` and `.windsurfrules` files that tell those agents: "After making browser-facing changes, call Expect MCP to verify." Agents start using Expect without the developer configuring anything. Same for `.claude/settings.json` — Expect auto-registers itself.

### GitHub PR Check + Reviewer Persona

Not just a CI check — Expect leaves review comments on the PR as a GitHub user. "I clicked through the signup flow and the confirmation email link 404s. Here's the recording." Feels like a team member, not a bot. Can request changes, blocking merge.

### Slack/Discord Bot

Lurks in deploy channels. When someone posts a deploy or PR link, Expect bot picks it up, runs tests against the preview URL, replies in-thread with results + recording GIF. Zero developer setup.

### Preview URL Auto-Detection

Detect Vercel/Netlify preview deploys from git metadata or CI env vars. Every preview deploy auto-gets a Expect run. No config — `expect.config.ts` just has `previewUrl: "auto"` and it figures it out from the Vercel API.

### `package.json` Test Script Replacement

`"test": "expect"` — when someone runs `pnpm test` or CI runs the test step, Expect executes. Replaces the concept of a test suite with "describe what should work and Expect verifies it live."

## Adversarial Positioning Against Browser-Use Tools

Core insight: agents currently use generic browser tools (Playwright MCP, chrome tools) to verify work. Expect should replace that default.

### Why Expect > Raw Browser Use

- Raw browser use is exploratory and unstructured — agent clicks around hoping things work
- Expect is adversarial and plan-driven — tries to break things, not just confirm they render
- Expect has session recordings (proof)
- Expect has cookies/auth state (tests the real app, not a logged-out shell)

### Expect as the Agent's Browser

Instead of competing with browser-use tools, BE the browser tool. Agents that need to look at a webpage route through Expect. Expect adds adversarial assertions on top of every navigation. The agent thinks it's just browsing; Expect is silently building a regression suite from the agent's actions.

### Agent Self-Doubt Hook

Hook into the agent's "I'm done" moment. When an agent says "I've completed the task," Expect intercepts and says "prove it." The agent can't mark done until Expect passes.

Implementation: a Claude Code hook on `assistant_response` that detects task-completion language and injects a Expect run before the response reaches the user.

### Reverse Integration — Expect Calls the Agent

Expect finds a bug → opens an issue or sends a message back to the coding agent: "The change you made broke X, here's the recording, fix it." Closes the loop without the human.

Agent writes code → Expect finds regression → Expect tells agent → agent fixes → Expect re-verifies. Human only sees the final result.

## Passive/Ambient Modes

### `expect watch` — Continuous Background Daemon

Runs like `tsc --watch`. Every time the dev server hot-reloads, Expect re-runs the relevant subset of its last test plan against the running app. Persistent terminal pane showing green/red.

### Editor Gutter Annotations

Expect watches the git diff and shows ghost text in the gutter: "this change affects the checkout flow — untested." Disappears once Expect has verified it. Like a type error but for behavioral coverage.

## Spec-Driven Testing

### `expect init` — Living Spec Generation

Scans the app, generates `expect.plan.md` describing all flows it can detect. Lives in the repo. Developers edit it like a spec doc. Expect executes it. The spec IS the test suite. Agents can also edit the spec when they add features.

## Social / Adoption Mechanics

### Expect Badge on PRs

Like a coverage badge but for browser verification. PRs without a Expect run show "unverified." Teams start requiring it culturally before it's enforced technically.

```
[![Expect](https://expect.dev/badge/repo/pr/123)](link-to-recording)
```

### Free Local, Metered CI

Free locally (drives bottom-up adoption), metered "Expect minutes" in CI (monetization). Developers adopt individually, teams pay when it becomes infrastructure.

---

## Trojan Horse Integrations

### `expect proxy` — Local Reverse Proxy With Built-In Verification

Run `expect proxy 3000` and it sits in front of your dev server on port 3001. Every page you visit manually gets recorded. When you're done, Expect says "I saw you test these 4 flows — want me to replay them after your next change?" Turns manual QA into automated regression for free. Developer doesn't change behavior at all.

### Browser Extension That Learns

Chrome extension that watches you QA your own app manually. Records your clicks, scrolls, assertions (did you inspect an element? check a value?). Exports a Expect plan from your real behavior. "I noticed you always check the cart total after adding an item — want me to keep checking that?"

### `expect adopt` — Wrap Existing Playwright/Cypress Tests

Don't ask teams to rewrite tests. `expect adopt ./e2e/` reads existing Playwright/Cypress test files, converts them into Expect plans, and runs them through Expect's adversarial engine. Migration cost = one command. Now their existing tests also get session recordings, auth injection, and adversarial coverage.

### LSP Server — Expect as a Language Feature

Expect registers as an LSP. When you hover over a route handler or component, it shows "Last verified: 2 hours ago" or "Never tested." Provides code actions: "Verify this endpoint" directly from your editor. Feels like TypeScript errors but for runtime behavior.

## Agentic Workflow Patterns

### Expect as CI Gatekeeper With Agency

Not a dumb pass/fail check. Expect fails a PR → reads the diff → writes a comment explaining exactly what broke and why → suggests a fix → optionally opens a follow-up PR with the fix. The developer's job becomes reviewing Expect's fix, not debugging the failure.

### Bouncer Mode — Agent Can't Deploy Without Expect

Integration with deployment tools (Vercel, Railway, Fly). Expect registers as a deployment check. The agent or developer triggers a deploy → Expect runs against the preview → blocks or allows promotion to production. Deploy button is grayed out until Expect says go.

### `expect bisect` — Automated Bug Bisection

Like `git bisect` but with browser verification. "This flow is broken." Expect binary-searches through recent commits, running browser tests at each one, finds the exact commit that broke it. Returns: "Commit abc123 broke checkout — here's the recording of before and after."

### Pair Programming Mode

Expect runs alongside an agent session in real-time. As the agent writes code, Expect continuously pokes at the running app in a second browser. If something breaks mid-session, Expect interrupts: "Hey, that last change broke the sidebar nav." The agent gets feedback before it finishes, not after.

### Multi-Agent Review Panel

Expect spawns multiple adversarial agents with different personas: "angry user who rage-clicks," "user on slow 3G," "user who opens 50 tabs," "user who navigates only with keyboard." Each persona generates a different test plan. PR gets a panel of reviews from different simulated users.

## Developer Experience Tricks

### `expect demo` — Generate Shareable GIFs/Videos From Plans

Run `expect demo signup-flow` and it executes the test plan while recording a polished screen recording. Output: a GIF or MP4 you can paste into a PR description, Slack message, or docs page. Testing becomes documentation. "Here's proof the feature works" is also "here's what the feature looks like."

### `expect story` — Storybook but Live

Instead of static component stories, Expect plans describe user journeys through real pages. `expect story` serves a local gallery where each "story" is a playable recording of a verified flow. Product managers browse these instead of reading test output.

### `expect diff` — Visual Diff Between Branches

Run `expect diff main` and Expect executes the same plan against both branches, then generates a visual side-by-side diff of the recordings. See exactly what changed in the UI — not in the code, in the actual rendered experience.

### Error Replay as Bug Reports

When Expect finds a failure, it exports a self-contained replay file (rrweb recording + network log + console output + DOM snapshot). Attach to a GitHub issue. The developer opens it and sees exactly what happened — no "steps to reproduce" needed.

## Unconventional Triggers

### Cron-Based Smoke Tests

`expect cron "0 */6 * * *" --plan smoke.md` — run your smoke test plan every 6 hours against production. Not CI-triggered, time-triggered. Catches regressions from config changes, third-party API breakage, expired tokens, CDN issues — things no commit triggers.

### Webhook Receiver

`expect listen --port 9999` — accepts webhooks from anywhere. Stripe sends a webhook when a payment config changes? Expect runs the checkout flow. LaunchDarkly flips a flag? Expect runs the affected flows. Database migration completes? Expect verifies the app still works.

### On Dependency Update

Hook into Renovate/Dependabot. When a dependency PR is opened, Expect runs against it. "React 19.1 just got bumped — does your app still work?" Most dependency breakage is visual or behavioral, not type-level. Expect catches what `tsc` misses.

### On Error Spike (Observability Integration)

Connect to Sentry/Datadog. When error rate spikes on a specific page, Expect auto-runs verification against that page. "Sentry reports 50 errors on /checkout in the last 10 minutes — running Expect now." Bridges observability and testing.

## Network Effect / Viral Ideas

### Expect Plans as a Community Registry

`expect install @expect-run/stripe-checkout` — community-contributed test plans for common integrations. Someone already wrote the adversarial plan for Stripe Checkout, Auth0 login, Twilio SMS verification. You install it and Expect adapts it to your app's selectors.

### `expect challenge` — Competitive QA

Developer A writes a feature. Developer B writes a Expect plan trying to break it. Gamified: "Your plan found 3 bugs in the checkout rewrite." Leaderboard of who writes the best adversarial plans. Makes QA fun instead of a chore.

### Expect Report as a Customer Artifact

B2B SaaS teams run `expect report` and generate a polished PDF/HTML report: "Here are the 47 flows we verified this sprint, with recordings." Ship to enterprise customers as proof of quality. Testing output becomes a sales tool.

## Stealth/Zero-Config Approaches

### `npx expect` — Zero Install

No `npm install`, no config file, no setup. `npx expect` in any repo and it works. Detects the framework (Next.js, Vite, Remix), finds the dev server command, starts it, scans the app, generates a plan, runs it. One command, zero config, first run in under 30 seconds.

### Git Clone Hook

`expect clone https://github.com/org/repo` — clones a repo, installs deps, starts the dev server, runs Expect. Used for: onboarding ("does this repo even work?"), evaluating open source projects, auditing vendor code. First experience with a codebase is Expect telling you whether it works.

### `expect monitor <url>` — Production Canary

Point Expect at a production URL. No repo needed. It crawls, builds a plan from what it discovers, runs it periodically. Catch production issues for apps you don't own or have source access to. Monitor competitor features, vendor dashboards, internal tools nobody maintains.

---

## IDE / Editor Integrations

### VS Code Extension — Inline Test Status

Panel in VS Code sidebar showing Expect plan status per file. Click a component → see the last recording of its verified behavior. Right-click a file → "Run Expect on changes to this file." Integrates with VS Code's Testing API so Expect plans show up in the native test explorer.

### Neovim / Terminal-Native Integration

`expect.nvim` plugin. `:Expect` runs against current buffer's diff. `:ExpectWatch` keeps a split pane with live status. Results render inline as virtual text annotations on the lines that affect browser behavior. Respects the terminal-first developer who won't install VS Code.

### JetBrains Plugin

Gutter icons in WebStorm/IntelliJ. Green dot = verified, yellow = stale, red = failing, gray = never tested. Click the dot to see the recording. Run configurations that invoke Expect plans as if they were JUnit tests.

### GitHub Codespaces / Gitpod Pre-build

`expect` runs as part of the dev container prebuild. When a new contributor opens a Codespace, Expect has already verified the app works. If prebuild Expect fails, the Codespace is flagged as broken before anyone wastes time on it.

## CI/CD Pipeline Integrations

### GitHub Actions Action

```yaml
- uses: expect-dev/action@v1
  with:
    plan: smoke.md
    url: ${{ steps.deploy.outputs.preview_url }}
```

First-class GitHub Action. Uploads recordings as artifacts. Posts summary as PR comment with inline screenshots. Shows up in the Checks tab with per-step pass/fail.

### GitLab CI Component

Same as above but for GitLab. Ships as a CI/CD component. Integrates with GitLab's test report viewer so Expect results show up natively alongside unit test results.

### Buildkite / CircleCI / Jenkins Plugins

Orbs, plugins, pipeline steps for every major CI system. Expect becomes as easy to add as "add this one line to your pipeline." Each plugin knows how to cache browser binaries, manage Expect auth, and upload recordings to the right artifact store.

### Terraform / Pulumi Post-Apply Hook

After infrastructure changes land, Expect runs against the affected services. "You just changed the CDN config — does the site still load?" Catches infra-level regressions that no code-level test would find.

## Framework-Specific Hooks

### Next.js Middleware

Expect ships a Next.js plugin. `next.config.ts` → `withExpect(nextConfig)`. In dev mode, every page navigation is tracked. When you hit save, Expect re-verifies the pages you touched. In production build, Expect runs the plan against the build output before `next build` exits.

### Remix / React Router Loader Validation

Intercepts loader/action responses during dev. If a loader starts returning different data shapes after a code change, Expect flags it before the browser even renders. Catches data regressions at the loader level, not the UI level.

### Vite Plugin

`vite-plugin-expect` — hooks into Vite's HMR. On every hot module replacement, Expect diffs what changed and runs a micro-plan targeting just that component. Sub-second feedback: "your button handler change broke form submission."

### Storybook Addon

Expect as a Storybook addon. Every story gets an "Expect" tab that shows the last adversarial test run against that component. Authors can attach Expect plans to stories. CI runs Expect against all stories as a visual regression + behavior regression layer.

## Platform / Hosting Integrations

### Vercel Integration (Marketplace)

Install from Vercel's integration marketplace. Zero config after that. Every preview deployment gets an Expect run. Results show in the Vercel dashboard alongside Web Vitals. "Deployment health: Expect 12/12 passed."

### Netlify Build Plugin

`netlify-plugin-expect` — runs after deploy, before the deploy goes live. If Expect fails, the deploy rolls back automatically. Netlify shows Expect status in the deploy log.

### Cloudflare Pages Integration

Same pattern. Expect runs against the Pages preview URL. Workers + Pages projects get Expect validation on every push.

### Railway / Fly.io / Render Post-Deploy Hook

Register Expect as a post-deploy health check. If it fails within N minutes of deploy, auto-rollback. Canary deploys validated by real browser testing, not just HTTP 200 checks.

## Communication / Notification Integrations

### Linear Integration

Expect failures auto-create Linear issues with the recording attached, tagged to the right team and project based on which files changed. When the issue is fixed and Expect passes, it auto-closes the issue.

### Jira Integration

Same as Linear but for enterprise. Expect failures become Jira tickets with all context embedded. Maps to existing sprint boards.

### Email Digest

Weekly email: "Expect ran 142 verifications this week. 3 regressions caught before merge. Here are the recordings." Gives engineering managers visibility without them touching the CLI.

### PagerDuty / Opsgenie Integration

`expect monitor` failures in production trigger PagerDuty incidents. Browser-level health checks that page on-call when the checkout flow is broken, not just when the server returns 500.

### Microsoft Teams / Google Chat Bot

Same as the Slack bot but for enterprises stuck on Teams/Chat. Posts recordings inline in channels.

## Developer Workflow Tools

### Tmux / Screen Session Layout

`expect session` sets up a tmux layout: left pane = your editor, right pane = Expect watch mode, bottom pane = dev server logs. One command to enter "verified development mode."

### Docker Compose Service

```yaml
services:
  expect:
    image: expect-dev/expect
    depends_on: [app]
    environment:
      - EXPECT_TARGET=http://app:3000
```

Add Expect as a service in your docker-compose. It watches the app container and runs plans whenever the app restarts. Works for any language/framework since it's just hitting HTTP.

### Makefile / Taskfile Target

`make expect` or `task expect` — runs Expect as part of existing build tool workflows. Teams that use Make don't need to learn pnpm. `make deploy` includes `make expect` as a prerequisite.

### Homebrew / apt / OS-Level Package

`brew install expect` — not an npm package, a real system binary. Works in non-Node projects. Python Django app? Go backend with HTMX? PHP Laravel? All can use Expect because it's just a CLI that hits a URL.

## Authentication / Identity Integrations

### OAuth Provider Auto-Detection

`expect auth` detects your app uses Auth0/Clerk/Supabase/Firebase Auth and sets up test credentials automatically. Creates a test user, logs in, captures the session, injects it into all future Expect runs. No manual cookie extraction needed.

### SSO / SAML Test Flow

Expect can navigate through full SSO flows — redirect to IdP, enter credentials, redirect back. Tests the complete auth journey, not just the app with pre-injected cookies. Catches "the Okta redirect is broken" before users hit it.

### Multi-Tenant Testing

`expect --tenant acme` / `expect --tenant globex` — runs the same plan but authenticated as different tenants. Validates tenant isolation: "Can Acme see Globex's data?" Instant compliance verification.

## Data / Analytics Integrations

### PostHog / Amplitude Event Verification

Expect runs a flow and then checks: "Did the expected analytics events fire?" Validates tracking instrumentation alongside UI behavior. "The signup flow works but we stopped sending the `user_signed_up` event after the refactor."

### Lighthouse / Web Vitals Alongside Behavior

Expect runs its plan and simultaneously collects Lighthouse scores. PR comment includes: "All 8 flows pass. LCP regressed from 1.2s to 3.4s on /dashboard." Behavioral correctness + performance in one tool.

### Database State Assertions

After running a browser flow, Expect connects to the database and verifies: "After the user clicked 'Place Order,' is there actually an order row in the DB?" End-to-end from click to persistence. Catches UI-says-success-but-backend-silently-failed bugs.

### Network Request Validation

During plan execution, Expect captures all network requests and validates: correct endpoints hit, no unexpected 4xx/5xx, no calls to deprecated APIs, no data sent to third parties that shouldn't receive it. Security + correctness.

## Mobile / Cross-Platform

### React Native / Expo Integration

Expect launches an iOS/Android simulator, installs the dev build, and runs plans against the mobile app. Same plan format, different target. `expect --platform ios` vs `expect --platform web`.

### Electron App Testing

Expect attaches to an Electron app's renderer process. Tests desktop apps the same way it tests web apps. VSCode extensions, Slack desktop, Figma plugins — all testable.

### Responsive / Viewport Testing

`expect --viewports mobile,tablet,desktop` — runs the same plan at multiple viewport sizes. Catches "the button is off-screen on mobile" or "the sidebar overlaps the content on tablet."

### Cross-Browser Matrix

`expect --browsers chromium,firefox,webkit` — runs plans across browser engines. PR comment shows a matrix: "Chrome: 12/12, Firefox: 11/12 (date picker broken), Safari: 12/12."

## Security / Compliance

### OWASP Baseline Scan Integration

While running behavior plans, Expect also runs basic security checks: open redirects, XSS via form inputs, CSRF token presence, auth bypass attempts. Testing and security scanning in one pass.

### Accessibility Audit During Plans

Every page Expect visits gets an axe-core scan. PR comment includes: "All flows pass. 2 new accessibility violations introduced on /settings." a11y regression testing as a free byproduct of behavior testing.

### Cookie / Privacy Compliance Check

Expect verifies: "Before the user accepts cookies, are any tracking scripts loaded? After they decline, do analytics events still fire?" GDPR/CCPA compliance validated by real browser behavior, not code review.

### SOC2 / HIPAA Evidence Generation

`expect audit` generates a timestamped, signed report of all verified flows. Attach to compliance audits. "Here's cryptographic proof that our PHI access controls were verified on this date."

## AI / LLM-Specific Integrations

### Agent Benchmark Suite

`expect benchmark agent.js` — runs a coding agent through a standardized set of tasks and measures how often Expect passes afterward. "Claude Code achieves 94% first-pass verification, Cursor 87%." Objective agent quality metrics.

### Prompt-to-Test

Paste a product spec or user story → Expect generates and runs a plan from natural language. "As a user, I want to reset my password via email" → Expect writes the plan, executes it, reports results. PM writes the spec, Expect tests it, no developer involvement.

### Screenshot-to-Test

Feed Expect a Figma screenshot or design mock. It navigates to the page and does visual comparison: "Does the implemented page match the design?" Catches "the developer built it but it looks nothing like the mock."

### Conversation-Driven Testing

`expect chat` — interactive REPL where you describe what to test in natural language. "Check if the dark mode toggle works." Expect runs it live, you see the recording, you say "now try it on the settings page too." Iterative, conversational test authoring.

## Misc / Wild Ideas

### `expect regress <issue-url>`

Pass a GitHub issue URL describing a bug. Expect reads the issue, generates a reproduction plan, verifies the bug exists, then re-runs the plan after the fix lands. The issue becomes the test. "This issue is now a permanent regression test."

### `expect onboard`

New developer joins. `expect onboard` walks them through every major flow in the app via recordings: "Here's how signup works. Here's the dashboard. Here's the admin panel." Living documentation generated from real Expect runs. Always up to date because it's re-generated from plans.

### `expect fuzz`

Adversarial fuzzing mode. Expect enters random data into every form, clicks random buttons, navigates to random routes, types gibberish, submits empty forms, pastes 10MB strings, uses emoji in name fields. Reports every crash, error, and unexpected behavior. Chaos monkey for your UI.

### `expect contract`

Two teams share a contract: "The /api/orders endpoint returns this shape and the Orders page renders it." Team A changes the API, Expect verifies Team B's frontend still works. API contract testing via real browser behavior, not JSON schema validation.

### `expect replay <session-id>`

Take a real user session from production (via rrweb, LogRocket, FullStory) and replay it through Expect. "This user hit a bug — let me reproduce their exact session against my local branch." Debug with real user behavior, not imagined steps.

### `expect migrate`

Running a database migration? `expect migrate` snapshots the app before, runs the migration, then runs the same plans after. Side-by-side comparison: "Everything still works" or "The user profile page broke because column X was renamed."

### `expect perf`

Performance-focused plans. Expect measures Time to Interactive, First Contentful Paint, and interaction latency for every step. Tracks over time. "Your PR made the dashboard 400ms slower to interactive." Performance regression testing without separate tooling.

### `expect a/b`

Run two versions of the app side by side and compare behavior. "Does the new checkout flow have fewer steps? Does it error in cases the old one handled?" Useful for refactors where behavior should be identical.

### `expect translate`

Run plans with browser locale set to each supported language. Catches: untranslated strings, layout breakage from long German words, RTL rendering issues with Arabic, date format mismatches. i18n regression testing.

### `expect offline`

Run plans with network throttled or disabled mid-flow. "Does the app handle going offline gracefully? Does the service worker kick in? Does it recover when connectivity returns?" Progressive web app verification.

### `expect multiuser`

Spawn two browsers simultaneously. User A sends a message, User B should see it appear. User A edits a document, User B should see the cursor. Real-time collaboration testing with actual concurrent browser sessions.

---

## Parasitic / Invisible Adoption

### Wrap `npm start` / `pnpm dev`

`expect dev` replaces your dev command. It starts your dev server AND Expect watch mode in one process. Developers switch from `pnpm dev` to `expect dev` and get continuous verification for free. If Expect ships a vite/next plugin, this is literally `next dev` with one extra import.

### Shell Alias Injection

`expect install-alias` adds `alias dev="expect dev"` to the user's shell profile. Now every time they type `dev`, Expect wraps their dev server. They forget it's there. Pure ambient verification.

### `.env` Auto-Loading for Test Users

Expect reads `.env.test` or `.env.expect` for test user credentials. Developers already have `.env` muscle memory. No new config format to learn. `EXPECT_USER_EMAIL=test@example.com` and it just works.

### Package Manager postinstall Hook

`npm install expect` adds a postinstall script that registers Expect's git hooks, creates the config file, and adds the MCP server entry. One `npm install` and the entire team has Expect configured. No manual setup steps.

## Time-Based / Temporal Triggers

### `expect before-meeting`

Scheduled to run 15 minutes before your standup. "Here's what's broken right now." Walk into standup already knowing the status instead of scrambling.

### `expect nightly`

Full comprehensive plan execution overnight. Results in your inbox by morning. Like a nightly build but it's a nightly verification. Catches slow-burn regressions that incremental checks miss.

### `expect since <timestamp>`

"What changed since Friday?" Expect diffs all commits since the timestamp, generates a combined plan, runs it. Monday morning sanity check: "Everything from last week still works."

### Dead Man's Switch

`expect heartbeat` — runs continuously in production. If Expect hasn't successfully verified a flow in 24 hours, it alerts. Not just "is the site up" but "can a user actually complete checkout." Catches silent failures.

## Social / Team Dynamics

### Blame Integration

`expect blame` — when a flow fails, Expect traces which commit introduced the regression and who authored it. Not punitive — informational. "The checkout broke in commit abc123 by @alice, likely the price formatting change."

### Team Coverage Dashboard

Web dashboard at `expect.dev/dashboard` showing: which flows are verified, how often, by whom. Managers see "the settings page hasn't been verified in 3 weeks." Teams see their coverage trends over time.

### Expect Score

Every PR gets an "Expect Score" — a composite of: flows verified, adversarial scenarios tried, edge cases covered. Visible on the PR. "This PR has an Expect Score of 87/100." Creates social pressure to improve scores.

### Code Review Hint

When a reviewer opens a PR, Expect shows: "These are the flows affected by this diff. Click to see recordings." The reviewer doesn't have to check out the branch and test manually. Review becomes: watch the recording, read the code.

## Developer Psychology

### Positive Reinforcement

When all Expect plans pass, show a satisfying animation/sound in the terminal. Dopamine hit for passing tests. "All 12 flows verified ✓" with a confetti effect in the TUI. Make passing feel good, not just failing feel bad.

### Streak Counter

"You've had 14 consecutive commits with passing Expect plans." Gamification. Breaking your streak feels bad. Subtle nudge to keep running Expect.

### Cost of Not Testing

`expect risk` — analyzes your diff and estimates: "This change touches 3 user-facing flows. Based on historical data, changes like this have a 34% chance of introducing a regression." Quantifies the risk of skipping Expect.

## Enterprise / B2B Specific

### Audit Trail

Every Expect run is logged with: who ran it, what plan, what commit, what results, full recording. Immutable audit trail for regulated industries. "Show me every verification of the payment flow in the last quarter."

### Role-Based Plans

Different plans for different roles: `expect --role qa-engineer` runs the full adversarial suite. `expect --role developer` runs a quick smoke test. `expect --role compliance-officer` runs the SOC2 checklist. Same tool, audience-appropriate depth.

### Self-Hosted / Air-Gapped

`expect --offline` — runs entirely locally, no cloud calls, no telemetry. For defense contractors, healthcare, finance. The LLM runs locally (Ollama/llama.cpp). Browser is local Playwright. Everything stays on-prem.

### Multi-Environment Verification

`expect --env staging,production` — runs the same plan against multiple environments and diffs the results. "Staging matches production" or "Staging has a bug that production doesn't — something went wrong with the deploy pipeline."

## Content / Documentation Generation

### `expect changelog`

Generates a user-facing changelog from Expect recordings. "This week: redesigned settings page (recording), fixed checkout bug (before/after recording), added dark mode (recording)." Release notes that show, not tell.

### `expect tutorial`

Generates interactive tutorials from Expect plans. "Step 1: Navigate to /signup. Step 2: Fill in your email..." with screenshots at each step. User documentation auto-generated from test plans. Always accurate because it's from real runs.

### `expect api-docs`

Runs plans and captures every API request/response. Generates OpenAPI specs from actual observed behavior. "Here's what your API actually does, based on real browser interactions." Catches doc drift.

## Infrastructure / Platform Ideas

### Expect Cloud — Shared Browser Pool

Run Expect plans against a cloud browser fleet instead of local Playwright. Faster (parallelized across machines), no local resource drain, works from CI without browser install. `expect --cloud` flag.

### Expect Proxy Network

Expect runs tests from multiple geographic locations. "Does your app work from Tokyo? Frankfurt? São Paulo?" Catches CDN issues, geo-blocking bugs, latency-dependent race conditions.

### Expect Replay Server

Self-hosted server that stores all recordings and serves them with a web UI. Browse by PR, by flow, by date. Search recordings: "Show me every time the checkout flow was tested in February." Institutional memory.

### Expect Diff Service

Upload two recordings, get a visual diff. Could be a standalone product/API. CI systems, other testing tools, even non-Expect users can diff browser recordings.

## Composition / Reuse Patterns

### Plan Inheritance

```
extends: base-smoke.md
exclude: [admin-flows]
add: [new-feature-flow]
```

Teams define a base plan. Feature branches extend it with their specific flows. Don't re-specify the whole suite for every PR.

### Plan Fragments / Mixins

Reusable plan snippets: `login.fragment.md`, `navigate-to-settings.fragment.md`. Compose plans from fragments: "Login, go to settings, change password, logout." DRY test plans.

### Conditional Plans

```
if: changed("src/auth/**")
run: auth-flows.md
```

Plans that only run when relevant files change. Avoids running the full suite on every commit. Smart, targeted verification.

### Parameterized Plans

```
plan: checkout.md
with:
  product: ["t-shirt", "digital-download", "subscription"]
  payment: ["credit-card", "paypal", "apple-pay"]
```

One plan, many variations. Combinatorial testing without writing combinatorial plans.

## Weird / Far-Out Ideas

### `expect dream`

Generative exploration. No plan — Expect just navigates your app like a curious user would. Clicks everything, fills every form, follows every link. Reports what it found: dead links, error pages, broken images, console errors. Exploratory testing with zero human input.

### `expect sabotage`

Expect intentionally introduces bugs (reverts random lines, swaps variable names, deletes CSS rules) and then runs plans to verify they catch the bug. Tests the tests. "Your plan would miss it if someone deleted the submit button handler." Mutation testing for browser behavior.

### `expect time-travel`

Record the app state at every commit. Scrub through time like a video timeline. "Show me what the dashboard looked like 3 months ago vs now." Architectural archaeology for UI.

### `expect villain`

Expect pretends to be a malicious user. Tries SQL injection in form fields, XSS payloads, IDOR attacks (change user IDs in URLs), path traversal, CSRF without tokens. Automated pen testing by a browser-wielding adversary.

### `expect empathy`

Simulates users with disabilities: screen reader navigation only, keyboard-only, high contrast mode, 200% zoom, color blindness simulation. "Can a blind user complete checkout?" Accessibility testing as a first-class mode.

### `expect load`

Spawn 100 concurrent browsers all running the same plan simultaneously. Poor man's load test. "Does checkout still work when 100 users are checking out at the same time?" Not about throughput metrics — about behavioral correctness under load.

### `expect gossip`

Expect runs on your app, then runs on your competitors' apps. Compares flows. "Stripe's checkout takes 2 steps, yours takes 5." "Linear's issue creation is 1.2s, yours is 3.8s." Competitive intelligence from real browser behavior.

### `expect archaeology`

Given a legacy app with no tests, no docs, and no one who remembers how it works — Expect crawls the entire app, maps every route, documents every form, catalogs every flow, and generates a comprehensive plan. "Here's everything your app does." Reverse-engineers the spec from the running software.

### `expect canary-in-a-coal-mine`

A tiny, trivial Expect plan that tests the most basic flow (e.g., "homepage loads"). Runs every 60 seconds. The moment it fails, everything stops — deploys halt, PRs freeze, alerts fire. The simplest possible health check, but browser-verified, not just HTTP-verified.

### `expect explain`

After running a plan, Expect generates a natural language explanation of what it did and what it found: "I navigated to the signup page, entered a valid email and short password. The form submitted but showed no error about password length. This is likely a bug — most apps require 8+ characters." QA reasoning, not just pass/fail.

### `expect surprise`

Expect picks a random flow it hasn't tested in a while and runs it. No schedule, no trigger — just occasional random verification. "Haven't checked the password reset flow in 12 days, running it now." Stochastic coverage that fills gaps in deterministic testing.

### `expect inherit`

When a developer leaves the team, `expect inherit @alice` catalogs every flow Alice frequently tested manually (from Expect recordings) and adds them to the team's automated plan. Institutional knowledge transfer via observed behavior.
