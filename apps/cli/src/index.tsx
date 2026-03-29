import { Option } from "effect";
import { Command } from "commander";
import { ChangesFor } from "@expect/supervisor";
import { runHeadless } from "./utils/run-test";
import { runInit } from "./commands/init";
import { runAddGithubAction } from "./commands/add-github-action";
import { runAddSkill } from "./commands/add-skill";
import { runAuditCommand } from "./commands/audit";
import { runWatchCommand } from "./commands/watch";
import { isRunningInAgent } from "./utils/is-running-in-agent";
import { isHeadless } from "./utils/is-headless";
import { type AgentBackend, detectAvailableAgents } from "@expect/agent";
import { useNavigationStore, Screen } from "./stores/use-navigation";
import { usePreferencesStore } from "./stores/use-preferences";
import { resolveChangesFor } from "./utils/resolve-changes-for";
import { renderApp } from "./program";
import { CI_EXECUTION_TIMEOUT_MS, VERSION } from "./constants";

const DEFAULT_INSTRUCTION =
  "Test all changes from main in the browser and verify they work correctly.";

type Target = "unstaged" | "branch" | "changes";

const TARGETS: readonly Target[] = ["unstaged", "branch", "changes"];

type OutputFormat = "text" | "json";

interface CommanderOpts {
  message?: string;
  flow?: string;
  yes?: boolean;
  agent?: AgentBackend;
  target?: Target;
  verbose?: boolean;
  headed?: boolean;
  noCookies?: boolean;
  replayHost?: string;
  ci?: boolean;
  timeout?: number;
  output?: OutputFormat;
}

const program = new Command()
  .name("expect")
  .description("AI-powered browser testing for your changes")
  .version(VERSION, "-v, --version")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option("-f, --flow <slug>", "reuse a saved flow by its slug")
  .option("-y, --yes", "run immediately without confirmation")
  .option(
    "-a, --agent <provider>",
    "agent provider to use (claude, codex, copilot, gemini, cursor, opencode, or droid)",
  )
  .option("-t, --target <target>", "what to test: unstaged, branch, or changes", "changes")
  .option("--verbose", "enable verbose logging")
  .option("--headed", "show a visible browser window during tests")
  .option("--no-cookies", "skip system browser cookie extraction")
  .option("--ci", "force CI mode: headless, no cookies, auto-yes, 30-minute timeout")
  .option("--timeout <ms>", "execution timeout in milliseconds", parseInt)
  .option("--output <format>", "output format: text (default) or json")
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
  $ expect --no-cookies -m "test" -y                skip system browser cookie extraction
  $ expect watch -m "test the login flow"           watch mode`,
  );

const seedStores = (opts: CommanderOpts, changesFor: ChangesFor) => {
  usePreferencesStore.setState({
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
    output: opts.output ?? "text",
  });
};

const waitForHydration = async () => {
  if (usePreferencesStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsub = usePreferencesStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
};

const runInteractiveForTarget = async (target: Target, opts: CommanderOpts) => {
  const { changesFor } = await resolveChangesFor(target);
  seedStores(opts, changesFor);
  await waitForHydration();
  const persistedAgent = usePreferencesStore.getState().agentBackend;
  renderApp(opts.agent ?? persistedAgent ?? "claude");
};

program
  .command("init")
  .description("set up expect for your coding agent")
  .option("-y, --yes", "skip confirmation prompts")
  .action(async (opts: { yes?: boolean }) => {
    await runInit(opts);
  });

const addCommand = program.command("add").description("add integrations to your project");

addCommand
  .command("github-action")
  .description("generate a GitHub Actions workflow for CI testing")
  .option("-y, --yes", "use defaults without prompting")
  .action(async (opts: { yes?: boolean }) => {
    await runAddGithubAction(opts);
  });

addCommand
  .command("skill")
  .description("install the expect skill for your coding agent")
  .option("-y, --yes", "skip confirmation prompts")
  .action(async (opts: { yes?: boolean }) => {
    const agents = detectAvailableAgents();
    await runAddSkill({ ...opts, agents });
  });

program
  .command("audit")
  .description("audit your workspace for lint, type, and formatting issues")
  .action(async () => {
    await runAuditCommand();
  });

program
  .command("watch")
  .description("watch for file changes and auto-run browser tests")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option(
    "-a, --agent <provider>",
    "agent provider to use (claude, codex, copilot, gemini, cursor, opencode, or droid)",
  )
  .option("-t, --target <target>", "what to test: unstaged, branch, or changes", "changes")
  .option("--verbose", "enable verbose logging")
  .option("--headed", "show a visible browser window during tests")
  .option("--no-cookies", "skip system browser cookie extraction")
  .option("--replay-host <url>", "website host for live replay viewer", "https://expect.dev")
  .action(async (opts: CommanderOpts) => {
    await runWatchCommand(opts);
  });

program.action(async () => {
  const opts = program.opts<CommanderOpts>();
  const target = opts.target ?? "changes";

  if (!TARGETS.includes(target)) {
    program.error(`Unknown target: ${target}. Use ${TARGETS.join(", ")}.`);
  }

  if (opts.ci || isRunningInAgent() || isHeadless()) return runHeadlessForTarget(target, opts);

  const hasDirectOptions = Boolean(opts.message || opts.flow || opts.yes);

  if (hasDirectOptions) {
    await runInteractiveForTarget(target, opts);
  } else {
    usePreferencesStore.setState({
      browserHeaded: opts.headed ?? false,
      replayHost: opts.replayHost ?? "https://expect.dev",
    });
    await waitForHydration();
    const persistedAgent = usePreferencesStore.getState().agentBackend;
    renderApp(opts.agent ?? persistedAgent ?? "claude");
  }
});

program.parse();
