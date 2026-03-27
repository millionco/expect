import { Effect, Option } from "effect";
import { Command } from "commander";
import { render } from "ink";
import { QueryClientProvider } from "@tanstack/react-query";
import { RegistryProvider } from "@effect/atom-react";
import { ChangesFor, Git } from "@expect/supervisor";
import type { AgentBackend } from "@expect/agent";
import { App } from "./components/app";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, CI_EXECUTION_TIMEOUT_MS, VERSION } from "./constants";
import { runHeadless } from "./utils/run-test";
import { runInit } from "./commands/init";
import { runAuditCommand } from "./commands/audit";
import { registerWatchCommand } from "./commands/watch";
import { isRunningInAgent } from "./utils/is-running-in-agent";
import { isHeadless } from "./utils/is-headless";
import { useNavigationStore, Screen } from "./stores/use-navigation";
import { usePreferencesStore } from "./stores/use-preferences";
import { queryClient } from "./query-client";
import { setInkInstance } from "./utils/clear-ink-display";
import { agentProviderAtom } from "./data/runtime";
import { flushSession, trackSessionStarted } from "./utils/session-analytics";
import {
  DEFAULT_INSTRUCTION,
  TARGETS,
  isTarget,
  resolveChangesForEffect,
} from "./utils/resolve-changes-for";
import type { Target } from "./utils/resolve-changes-for";

export interface CommanderOpts {
  readonly message?: string;
  readonly flow?: string;
  readonly yes?: boolean;
  readonly agent?: AgentBackend;
  readonly target?: Target;
  readonly verbose?: boolean;
  readonly headed?: boolean;
  readonly noCookies?: boolean;
  readonly replayHost?: string;
  readonly ci?: boolean;
  readonly timeout?: number;
}

const MOUSE_DISABLE = "\u001b[?1000l\u001b[?1006l";

const renderApp = async (agent: AgentBackend) => {
  const sessionStartedAt = Date.now();
  await trackSessionStarted();

  process.stdout.write(ALT_SCREEN_ON);
  process.on("exit", () => process.stdout.write(MOUSE_DISABLE + ALT_SCREEN_OFF));
  const instance = render(
    <RegistryProvider initialValues={[[agentProviderAtom, Option.some(agent)]]}>
      <QueryClientProvider client={queryClient}>
        <App agent={agent} />
      </QueryClientProvider>
    </RegistryProvider>,
  );
  setInkInstance(instance);
  await instance.waitUntilExit();
  await flushSession(sessionStartedAt);
  process.stdout.write(MOUSE_DISABLE + ALT_SCREEN_OFF);
  process.exit(0);
};

const resolveChangesFor = (target: Target) =>
  Effect.runPromise(
    resolveChangesForEffect(target).pipe(Effect.provide(Git.withRepoRoot(process.cwd()))),
  );

const seedStores = (opts: CommanderOpts, changesFor: ChangesFor) => {
  usePreferencesStore.setState({
    ...(opts.agent ? { agentBackend: opts.agent } : {}),
    browserHeaded: opts.headed ?? false,
    replayHost: opts.replayHost ?? "https://expect.dev",
  });

  if (opts.message) {
    useNavigationStore.setState({
      screen: Screen.Testing({ changesFor, instruction: opts.message }),
    });
  } else {
    useNavigationStore.setState({ screen: Screen.Main() });
  }
};

const runHeadlessForTarget = async (target: Target, opts: CommanderOpts) => {
  const ciMode = opts.ci || isRunningInAgent() || isHeadless();
  const timeoutMs = opts.timeout
    ? Option.some(opts.timeout)
    : ciMode
      ? Option.some(CI_EXECUTION_TIMEOUT_MS)
      : Option.none();

  const { changesFor } = await resolveChangesFor(target);
  return runHeadless({
    changesFor,
    instruction: opts.message ?? DEFAULT_INSTRUCTION,
    agent: opts.agent ?? "claude",
    verbose: opts.verbose ?? false,
    headed: ciMode ? false : (opts.headed ?? false),
    ci: ciMode,
    timeoutMs,
    requiresCookies: !(opts.noCookies ?? false) && !ciMode,
  });
};

const runInteractiveForTarget = async (target: Target, opts: CommanderOpts) => {
  const { changesFor } = await resolveChangesFor(target);
  seedStores(opts, changesFor);
  renderApp(opts.agent ?? "claude");
};

export const createExpectProgram = () => {
  const program = new Command()
    .name("expect")
    .description("AI-powered browser testing for your changes")
    .version(VERSION, "-v, --version")
    .option("-m, --message <instruction>", "natural language instruction for what to test")
    .option("-f, --flow <slug>", "reuse a saved flow by its slug")
    .option("-y, --yes", "run immediately without confirmation")
    .option("-a, --agent <provider>", "agent provider to use (claude or codex)")
    .option("-t, --target <target>", "what to test: unstaged, branch, or changes", "changes")
    .option("--verbose", "enable verbose logging")
    .option("--headed", "show a visible browser window during tests")
    .option("--no-cookies", "skip system browser cookie extraction")
    .option("--ci", "force CI mode: headless, no cookies, auto-yes, 30-minute timeout")
    .option("--timeout <ms>", "execution timeout in milliseconds", Number.parseInt)
    .option("--replay-host <url>", "website host for live replay viewer", "https://expect.dev")
    .addHelpText(
      "after",
      `
Examples:
  $ expect                                          open interactive TUI
  $ expect -m "test the login flow" -y              run immediately
  $ expect --headed -m "smoke test" -y              run with a visible browser
  $ expect --target branch                          test all branch changes
  $ expect --target unstaged                        test unstaged changes
  $ expect watch                                    watch local file changes
  $ expect-watch                                    standalone watch command`,
    );

  program
    .command("init")
    .description("set up expect for your coding agent")
    .option("-y, --yes", "skip confirmation prompts")
    .action(async (opts: { yes?: boolean }) => {
      await runInit(opts);
    });

  program
    .command("audit")
    .description("audit your workspace for lint, type, and formatting issues")
    .action(async () => {
      await runAuditCommand();
    });

  registerWatchCommand(program);

  program.action(async () => {
    const opts = program.opts<CommanderOpts>();
    const target = opts.target ?? "changes";

    if (!isTarget(target)) {
      program.error(`Unknown target: ${target}. Use ${TARGETS.join(", ")}.`);
    }

    if (opts.ci || isRunningInAgent() || isHeadless()) {
      return runHeadlessForTarget(target, opts);
    }

    const hasDirectOptions = Boolean(opts.message || opts.flow || opts.yes);
    if (hasDirectOptions) {
      await runInteractiveForTarget(target, opts);
      return;
    }

    usePreferencesStore.setState({
      browserHeaded: opts.headed ?? false,
      replayHost: opts.replayHost ?? "https://expect.dev",
    });
    renderApp(opts.agent ?? "claude");
  });

  return program;
};
