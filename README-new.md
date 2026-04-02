# <img src="https://github.com/millionco/testie/blob/main/apps/website/public/icon.svg?raw=true" width="60" align="center" /> Expect

[![version](https://img.shields.io/npm/v/expect-cli?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/expect-cli)
[![downloads](https://img.shields.io/npm/dt/expect-cli.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/expect-cli)

**Expect** tests your app in a browser so you don't have to. Works with Claude Code, Codex, [and more](https://github.com/millionco/expect#supported-agents)

- Run `/expect` inside Claude Code or Codex.
- Spawns agents to simulating real logged-in users to find issues and regressions.
- No more writing Playwright by hand + get video recordings and GitHub Action out of the box.

### **[See it in action →](https://expect.dev)**

## Install

Open a terminal in your project directory and run:

```bash
npx expect-cli@latest init
```

This will guide you through a setup process. Once installed, you can run `/expect` inside Claude Code or Codex to start testing.

## FAQ

**How is this different from Puppeteer/Playwright/Cypress?**

Before Expect: you wrote Playwright/Cypress scripts by hand, maintained selectors, and wired up assertions yourself.

After Expect: Expect reads your code changes, generates a test plan in plain English, and runs it in a real browser. You never write a test file.

**How is this different from my coding agent testing?**

For longer tasks, your agent needs to verify its work and get feedback. Expect acts like an expert QA tester — it opens a real browser, checks what the agent built, and reports back what's broken so the agent can fix it.

**How is this different from computer use / `agent-browser` / Claude in Chrome?**

Those tools give your agent general-purpose browser access via screenshots and mouse coordinates. Expect is purpose-built for testing — it uses Playwright for fast DOM automation, reads your code changes, generates a test plan, and runs it with your real cookies.

**When does it run? How does it fit into my workflow?**

Your coding agent calls `/expect` as a skill whenever it needs to validate its work in a real browser. You can also trigger it from CI by adding the GitHub Action to test every PR automatically before merge.

**Does it work in CI?**

Yes. Use `--ci` or the `add github-action` command to set up a workflow that tests every PR. In CI mode it runs headless, skips cookie extraction, auto-approves the plan, and enforces a 30-minute timeout.

**Is there a cloud or enterprise version?**

Coming soon. Email [aiden@million.dev](mailto:aiden@million.dev) if you have questions or ideas.

## Options

<!-- Keep this table in sync with apps/cli/src/index.tsx -->

| Flag                          | Description                                                                            | Default              |
| ----------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| `-m, --message <instruction>` | Natural language instruction for what to test                                          | —                    |
| `-f, --flow <slug>`           | Reuse a saved flow by its slug                                                         | —                    |
| `-y, --yes`                   | Run immediately without confirmation                                                   | —                    |
| `-a, --agent <provider>`      | Agent provider (`claude`, `codex`, `copilot`, `gemini`, `cursor`, `opencode`, `droid`) | auto-detect          |
| `-t, --target <target>`       | What to test: `unstaged`, `branch`, or `changes`                                       | `changes`            |
| `-u, --url <urls...>`         | Base URL(s) for the dev server (skips port picker)                                     | —                    |
| `--headed`                    | Show a visible browser window during tests                                             | —                    |
| `--no-cookies`                | Skip system browser cookie extraction                                                  | —                    |
| `--ci`                        | Force CI mode: headless, no cookies, auto-yes, 30-min timeout                          | —                    |
| `--timeout <ms>`              | Execution timeout in milliseconds                                                      | —                    |
| `--output <format>`           | Output format: `text` or `json`                                                        | `text`               |
| `--verbose`                   | Enable verbose logging                                                                 | —                    |
| `--replay-host <url>`         | Website host for live replay viewer                                                    | `https://expect.dev` |
| `-v, --version`               | Print version                                                                          | —                    |
| `-h, --help`                  | Display help                                                                           | —                    |

## Supported Agents

Expect works with the following coding agents. It auto-detects which agents are installed on your `PATH`. If multiple are available, it defaults to the first one found. Use `-a <provider>` to pick a specific agent.

| Agent                                                         | Flag          | Install                                    |
| ------------------------------------------------------------- | ------------- | ------------------------------------------ |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `-a claude`   | `npm install -g @anthropic-ai/claude-code` |
| [Codex](https://github.com/openai/codex#readme)               | `-a codex`    | `npm install -g @openai/codex`             |
| [GitHub Copilot](https://github.com/features/copilot/cli)     | `-a copilot`  | `npm install -g @github/copilot`           |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli)     | `-a gemini`   | `npm install -g @google/gemini-cli`        |
| [Cursor](https://cursor.com)                                  | `-a cursor`   | [cursor.com](https://cursor.com)           |
| [OpenCode](https://opencode.ai)                               | `-a opencode` | `npm install -g opencode-ai`               |
| [Factory Droid](https://factory.ai)                           | `-a droid`    | `npm install -g droid`                     |

## Resources & Contributing Back

Want to try it out? Check out [our demo](https://expect.dev).

Find a bug? Head over to our [issue tracker](https://github.com/millionco/expect/issues) and we'll do our best to help. We love pull requests, too!

We expect all contributors to abide by the terms of our [Code of Conduct](https://github.com/millionco/expect/blob/main/.github/CODE_OF_CONDUCT.md).

[**→ Start contributing on GitHub**](https://github.com/millionco/expect/blob/main/CONTRIBUTING.md)

### License

FSL-1.1-MIT © [Million Software, Inc.](https://million.dev)
