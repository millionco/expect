# Contributing to Expect

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v10+)

## Setup

```bash
git clone https://github.com/millionco/expect.git
cd expect
pnpm install
```

## Development

```bash
pnpm dev        # start dev server (all packages)
pnpm build      # production build
pnpm check      # format + lint + type checks
pnpm test       # run tests
```

## Project Structure

This is a pnpm monorepo:

- `apps/cli` — Ink-based terminal UI
- `apps/website` — Marketing site
- `packages/supervisor` — Orchestration, state management, git operations
- `packages/agent` — LLM backend
- `packages/browser` — Playwright automation
- `packages/cookies` — Browser profile / cookie extraction
- `packages/shared` — Domain models

## Submitting Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Run `pnpm check` and `pnpm test` to verify everything passes.
4. Open a pull request against `main`.

Keep PRs focused — one feature or fix per PR.

## Code Style

- Arrow functions only, `interface` over `type`.
- No comments unless it's a hack (`// HACK: reason`).
- kebab-case filenames, no barrel/index files.
- See `CLAUDE.md` for the full style guide and Effect-TS patterns.

## Reporting Bugs

Open an issue at [github.com/millionco/expect/issues](https://github.com/millionco/expect/issues) with steps to reproduce.

## License

By contributing, you agree that your contributions will be licensed under the FSL-1.1-MIT license.
