import { Option } from "effect";
import { Command } from "commander";
import { ChangesFor } from "@expect/supervisor";
import { runHeadless } from "./utils/run-test";
import { runInit } from "./commands/init";
import { runAddGithubAction } from "./commands/add-github-action";
import { runAddSkill } from "./commands/add-skill";
import { runWatchCommand } from "./commands/watch";
import { runUpdateCommand } from "./commands/update";
import { isRunningInAgent } from "@expect/shared/launched-from";
import { isHeadless } from "./utils/is-headless";
import { type AgentBackend, detectAvailableAgents } from "@expect/agent";
import { useNavigationStore, Screen } from "./stores/use-navigation";
import { usePreferencesStore } from "./stores/use-preferences";
import { resolveChangesFor } from "./utils/resolve-changes-for";
import { renderApp } from "./program";
import { CI_EXECUTION_TIMEOUT_MS, VERSION, VERSION_API_URL } from "./constants";
import { prompts } from "./utils/prompts";
import { highlighter } from "./utils/highlighter";
import { logger } from "./utils/logger";
import { hasInstalledExpectSkill } from "./utils/expect-skill";
import {
  type BrowserMode,
  isValidBrowserMode,
  readProjectPreference,
} from "./utils/project-preferences-io";
import { resolveProjectRoot } from "./utils/project-root";

try {
  fetch(`${VERSION_API_URL}?source=cli&t=${Date.now()}`).catch(() => {});
} catch {}

const lazyBrowserMode = (() => {
  let cached: BrowserMode | undefined;
  let resolved = false;
  return async () => {
    if (!resolved) {
      const value = readProjectPreference<unknown>(await resolveProjectRoot(), "browserMode");
      cached = isValidBrowserMode(value) ? value : undefined;
      resolved = true;
    }
    return cached;
  };
})();

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
  browserMode?: string;
  profile?: string;
  noCookies?: boolean;
  ci?: boolean;
  timeout?: number;
  output?: OutputFormat;
  url?: string[];
}

// HACK: when adding or changing options/commands below, update the Options and Commands tables in README-new.md
const program = new Command()
  .name("expect")
  .description("AI-powered browser testing for your changes")
  .enablePositionalOptions()
  .passThroughOptions()
  .version(VERSION, "-v, --version")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option("-f, --flow <slug>", "reuse a saved flow by its slug")
  .option("-y, --yes", "run immediately without confirmation")
  .option(
    "-a, --agent <provider>",
    "agent provider to use (claude, codex, copilot, gemini, cursor, opencode, droid, or pi)",
  )
  .option("-t, --target <target>", "what to test: unstaged, branch, or changes", "changes")
  .option("--verbose", "enable verbose logging")
  .option("--browser-mode <mode>", "browser mode: cdp, headed, or headless")
  .option("--profile <name>", "reuse a Chrome profile by name (e.g. Default)")
  .option("--no-cookies", "skip system browser cookie extraction")
  .option("--ci", "force CI mode: headless, no cookies, auto-yes, 30-minute timeout")
  .option("--timeout <ms>", "execution timeout in milliseconds", parseInt)
  .option("--output <format>", "output format: text (default) or json")
  .option("-u, --url <urls...>", "base URL(s) for the dev server (skips port picker)")
  .addHelpText(
    "after",
    `
Examples:
  $ expect                                          open interactive TUI
  $ expect -m "test the login flow" -y              run immediately
  $ expect --browser-mode headless -m "smoke test"  run with headless browser
  $ expect --browser-mode headed -m "test" -y       launch a fresh browser
  $ expect --target branch                          test all branch changes
  $ expect update                                   update to the latest CLI release
  $ expect --no-cookies -m "test" -y                skip system browser cookie extraction
  $ expect -u http://localhost:3000 -m "test" -y    specify dev server URL directly
  $ expect watch -m "test the login flow"           watch mode`,
  );

const resolveBrowserMode = async (opts: CommanderOpts) => {
  if (opts.browserMode) {
    if (isValidBrowserMode(opts.browserMode)) return opts.browserMode;
    logger.warn(
      `  Unknown browser mode "${opts.browserMode}". Expected: cdp, headed, or headless.`,
    );
  }
  return (await lazyBrowserMode()) ?? "headed";
};

const seedStores = async (opts: CommanderOpts, changesFor: ChangesFor) => {
  const browserMode = await resolveBrowserMode(opts);
  usePreferencesStore.setState({
    verbose: opts.verbose ?? false,
    browserMode,
    browserHeaded: browserMode !== "headless",
    browserProfile: opts.profile,
  });

  if (opts.message) {
    useNavigationStore.setState({
      screen: Screen.Testing({ changesFor, instruction: opts.message, baseUrls: opts.url }),
    });
  } else {
    useNavigationStore.setState({ screen: Screen.Main() });
  }

  if (opts.url) {
    usePreferencesStore.setState({ cliBaseUrls: opts.url });
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
  const browserMode = await resolveBrowserMode(opts);
  return runHeadless({
    changesFor,
    instruction: opts.message ?? DEFAULT_INSTRUCTION,
    agent: opts.agent ?? "claude",
    verbose: opts.verbose ?? false,
    headed: opts.browserMode ? browserMode === "headed" : !ciMode,
    ci: ciMode,
    noCookies: opts.noCookies ?? ciMode,
    timeoutMs,
    output: opts.output ?? "text",
    baseUrl: opts.url?.join(", "),
  });
};

const promptSkillInstall = async () => {
  const agents = detectAvailableAgents();
  if (hasInstalledExpectSkill(await resolveProjectRoot(), agents)) return;

  logger.break();
  const response = await prompts({
    type: "confirm",
    name: "installSkill",
    message: `Install the ${highlighter.info("expect")} skill for your coding agents?`,
    initial: true,
  });

  if (response.installSkill) {
    await runAddSkill({ agents });
    logger.break();
  }
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
  await seedStores(opts, changesFor);
  await waitForHydration();
  const persistedAgent = usePreferencesStore.getState().agentBackend;
  renderApp(opts.agent ?? persistedAgent ?? "claude");
};

program
  .command("init")
  .alias("setup")
  .description("set up expect for your coding agent")
  .option("-y, --yes", "skip confirmation prompts")
  .option("--dry", "skip install steps, only run prompts")
  .option("--cdp", "use CDP browser mode (connect to existing browser)")
  .option("--headed", "use headed browser mode (launch a browser window)")
  .option("--headless", "use headless browser mode (no visible browser)")
  .addHelpText(
    "after",
    `
Examples:
  $ expect init                     interactive setup
  $ expect init -y                  non-interactive, use defaults
  $ expect init --cdp               set browser mode to CDP
  $ expect init --headed            set browser mode to headed
  $ expect init --headless          set browser mode to headless`,
  )
  .action(
    async (opts: {
      yes?: boolean;
      dry?: boolean;
      cdp?: boolean;
      headed?: boolean;
      headless?: boolean;
    }) => {
      await runInit(opts);
    },
  );

const addCommand = program.command("add").description("add integrations to your project");

addCommand
  .command("github-action")
  .description("add a GitHub Actions workflow that tests every PR in CI")
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
  .command("watch")
  .description("watch for file changes and auto-run browser tests")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option(
    "-a, --agent <provider>",
    "agent provider to use (claude, codex, copilot, gemini, cursor, opencode, droid, or pi)",
  )
  .option("-t, --target <target>", "what to test: unstaged, branch, or changes", "changes")
  .option("--verbose", "enable verbose logging")
  .option("--browser-mode <mode>", "browser mode: cdp, headed, or headless")
  .option("--profile <name>", "reuse a Chrome profile by name (e.g. Default)")
  .option("--no-cookies", "skip system browser cookie extraction")
  .option("-u, --url <urls...>", "base URL(s) for the dev server")
  .action(async (opts: CommanderOpts) => {
    await runWatchCommand(opts);
  });

program
  .command("mcp")
  .description("start as a standalone MCP server (stdio transport)")
  .action(async () => {
    const { execFileSync } = await import("node:child_process");
    const mcpBin = new URL("./browser-mcp.js", import.meta.url).pathname;
    execFileSync(process.execPath, [mcpBin], { stdio: "inherit" });
  });

program
  .command("update")
  .description("update expect-cli globally")
  .argument("[version]", "version or dist-tag to install")
  .action(async (version?: string) => {
    await runUpdateCommand(version);
  });

program.action(async () => {
  const opts = program.opts<CommanderOpts>();

  const target = opts.target ?? "changes";

  if (!TARGETS.includes(target)) {
    program.error(`Unknown target: ${target}. Use ${TARGETS.join(", ")}.`);
  }

  if (opts.ci || isRunningInAgent() || isHeadless()) return runHeadlessForTarget(target, opts);

  await promptSkillInstall();

  const hasDirectOptions = Boolean(opts.message || opts.flow || opts.yes);

  if (hasDirectOptions) {
    await runInteractiveForTarget(target, opts);
  } else {
    const browserMode = await resolveBrowserMode(opts);
    usePreferencesStore.setState({
      verbose: opts.verbose ?? false,
      browserMode,
      browserHeaded: browserMode !== "headless",
      browserProfile: opts.profile,
    });
    if (opts.url) {
      usePreferencesStore.setState({ cliBaseUrls: opts.url });
    }
    await waitForHydration();
    const persistedAgent = usePreferencesStore.getState().agentBackend;
    renderApp(opts.agent ?? persistedAgent ?? "claude");
  }
});

program.parse();
