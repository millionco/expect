# Expect

[![version](https://img.shields.io/npm/v/expect-cli?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/expect-cli)
[![downloads](https://img.shields.io/npm/dt/expect-cli.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/expect-cli)

**Expect** is a skill for testing your agent's code in a real browser.

### **[Demo →](https://expect.dev)**

## Getting Started

1. Ask your agent to `Fetch https://www.expect.dev/ and run init script`
2. Run `/expect` inside Claude Code, Codex, [and more](https://github.com/millionco/expect#supported-agents)
3. Expect spawns subagents simulating real logged-in users to find issues and regressions
4. Your agent will fix any issues Expect finds, then re-run to verify

## FAQ

#### 1. What is Expect?

A skill that reads your git changes, generates a test plan, and runs it in a real browser with Playwright. It hooks into your existing agent (Claude Code, Codex, Cursor) and runs entirely on your machine. It checks for performance (long animation frames, INP, LCP), security (npm deps, CSRF attacks, vulns), design tweaks (broken hover states, links, buttons), and app completeness (missing metadata, dead links).

#### 2. Why not just use Puppeteer, Playwright, or Cypress?

Instead of writing scripts, maintaining selectors, and wiring up assertions, Expect reads your code changes and tests them in a real browser automatically. It's like giving your agent QA superpowers.

#### 3. How is this different from computer-use agents?

General-purpose browser tools rely on screenshots and mouse coordinates. Expect is purpose-built for testing: it uses Playwright for fast DOM automation, reads your code changes, generates a test plan, and runs it with your real cookies, then reports back what's broken so the agent can fix it.

#### 4. Does it work in CI?

Yes. Use `--ci` or the `add github-action` command to set up a workflow that tests every PR. In CI mode it runs headless, skips cookie extraction, auto-approves the plan, and enforces a 30-minute timeout.

#### 5. Does it support mobile testing?

Coming soon.

#### 6. Is there a hosted or enterprise version?

Coming soon. Email [aiden@million.dev](mailto:aiden@million.dev) if you have questions or ideas.

## Options

| Flag                          | Description                                                                                  | Default     |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| `-m, --message <instruction>` | Natural language instruction for what to test                                                | -           |
| `-f, --flow <slug>`           | Reuse a saved flow by its slug                                                               | -           |
| `-y, --yes`                   | Run immediately without confirmation                                                         | -           |
| `-a, --agent <provider>`      | Agent provider (`claude`, `codex`, `copilot`, `gemini`, `cursor`, `opencode`, `droid`, `pi`) | auto-detect |
| `-t, --target <target>`       | What to test: `unstaged`, `branch`, or `changes`                                             | `changes`   |
| `-u, --url <urls...>`         | Base URL(s) for the dev server (skips port picker)                                           | -           |
| `--browser-mode <mode>`       | Browser mode: `headed` or `headless`                                                         | `headed`    |
| `--cdp <url>`                 | Connect to an existing Chrome via CDP WebSocket URL                                          | -           |
| `--profile <name>`            | Reuse a Chrome profile by name (e.g. Default)                                                | -           |
| `--no-cookies`                | Skip system browser cookie extraction                                                        | -           |
| `--ci`                        | Force CI mode: headless, no cookies, auto-yes, 30-min timeout                                | -           |
| `--timeout <ms>`              | Execution timeout in milliseconds                                                            | -           |
| `--output <format>`           | Output format: `text` or `json`                                                              | `text`      |
| `--verbose`                   | Enable verbose logging                                                                       | -           |
| `-v, --version`               | Print version                                                                                | -           |
| `-h, --help`                  | Display help                                                                                 | -           |

## Supported Agents

Expect works with the following coding agents. It auto-detects which agents are installed on your `PATH`. If multiple are available, it defaults to the first one found. Use `-a <provider>` to pick a specific agent.

| Agent                                                         | Flag          | Install                                        |
| ------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `-a claude`   | `npm install -g @anthropic-ai/claude-code`     |
| [Codex](https://github.com/openai/codex#readme)               | `-a codex`    | `npm install -g @openai/codex`                 |
| [GitHub Copilot](https://github.com/features/copilot/cli)     | `-a copilot`  | `npm install -g @github/copilot`               |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli)     | `-a gemini`   | `npm install -g @google/gemini-cli`            |
| [Cursor](https://cursor.com)                                  | `-a cursor`   | [cursor.com](https://cursor.com)               |
| [OpenCode](https://opencode.ai)                               | `-a opencode` | `npm install -g opencode-ai`                   |
| [Factory Droid](https://factory.ai)                           | `-a droid`    | `npm install -g droid`                         |
| [Pi](https://github.com/mariozechner/pi-coding-agent)         | `-a pi`       | `npm install -g @mariozechner/pi-coding-agent` |

## Resources & Contributing Back

Want to try it out? Check out [our demo](https://expect.dev).

Find a bug? Head over to our [issue tracker](https://github.com/millionco/expect/issues) and we'll do our best to help. We love pull requests, too!

We expect all contributors to abide by the terms of our [Code of Conduct](https://github.com/millionco/expect/blob/main/.github/CODE_OF_CONDUCT.md).

**[→ Start contributing on GitHub](https://github.com/millionco/expect/blob/main/CONTRIBUTING.md)**

### License

FSL-1.1-MIT © [Million Software, Inc.](https://million.dev)
