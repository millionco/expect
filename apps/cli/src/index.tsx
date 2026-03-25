import { Effect } from "effect";
import { Command } from "commander";
import { render } from "ink";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./components/app";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, VERSION } from "./constants";
import { ChangesFor, Git } from "@expect/supervisor";
import { runHeadless } from "./utils/run-test";
import { runInit } from "./commands/init";
import { isRunningInAgent } from "./utils/is-running-in-agent";
import { isHeadless } from "./utils/is-headless";
import type { AgentBackend } from "@expect/agent";
import { useNavigationStore, Screen } from "./stores/use-navigation";
import { usePreferencesStore } from "./stores/use-preferences";
import { queryClient } from "./query-client";
import { setInkInstance } from "./utils/clear-ink-display";
import { RegistryProvider } from "@effect/atom-react";
import { agentProviderAtom } from "./data/runtime";
import { flushSession, trackSessionStarted } from "./utils/session-analytics";
import { playSound } from "./utils/play-sound";
import { Option } from "effect";

const DEFAULT_INSTRUCTION =
  "Test all changes from main in the browser and verify they work correctly.";

type Target = "unstaged" | "branch" | "changes";

const TARGETS: readonly Target[] = ["unstaged", "branch", "changes"];

interface CommanderOpts {
  message?: string;
  flow?: string;
  yes?: boolean;
  agent?: AgentBackend;
  target?: Target;
  verbose?: boolean;
  headed?: boolean;
}

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
  .addHelpText(
    "after",
    `
Examples:
  $ expect                                          open interactive TUI
  $ expect -m "test the login flow" -y              run immediately
  $ expect --headed -m "smoke test" -y              run with a visible browser
  $ expect --target branch                          test all branch changes
  $ expect --target unstaged                        test unstaged changes`,
  );

const renderApp = async (agent: AgentBackend) => {
  const sessionStartedAt = Date.now();
  await trackSessionStarted();

  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
  });

  process.stdout.write(ALT_SCREEN_ON);
  process.on("exit", () => process.stdout.write(ALT_SCREEN_OFF));
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
  if (!interrupted) {
    await playSound();
  }
  process.exit(0);
};

const resolveChangesFor = async (target: Target) => {
  const cwd = process.cwd();
  return Effect.runPromise(
    Effect.gen(function* () {
      const git = yield* Git;
      const mainBranch = yield* git.getMainBranch;
      const currentBranch = yield* git.getCurrentBranch;

      if (target === "branch") {
        return {
          changesFor: ChangesFor.makeUnsafe({ _tag: "Branch", mainBranch }),
          currentBranch,
        };
      }
      if (target === "changes") {
        return {
          changesFor: ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
          currentBranch,
        };
      }
      return {
        changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
        currentBranch,
      };
    }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
  );
};

const seedStores = (opts: CommanderOpts, changesFor: ChangesFor) => {
  usePreferencesStore.setState({
    ...(opts.agent ? { agentBackend: opts.agent } : {}),
    browserHeaded: opts.headed ?? false,
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
  const { changesFor } = await resolveChangesFor(target);
  return runHeadless({
    changesFor,
    instruction: opts.message ?? DEFAULT_INSTRUCTION,
    agent: opts.agent ?? "claude",
    verbose: opts.verbose ?? false,
    headed: opts.headed ?? false,
  });
};

const runInteractiveForTarget = async (target: Target, opts: CommanderOpts) => {
  const { changesFor } = await resolveChangesFor(target);
  seedStores(opts, changesFor);
  renderApp(opts.agent ?? "claude");
};

program
  .command("init")
  .description("set up expect for your coding agent")
  .option("-y, --yes", "skip confirmation prompts")
  .action(async (opts: { yes?: boolean }) => {
    await runInit(opts);
  });

program.action(async () => {
  const opts = program.opts<CommanderOpts>();
  const target = opts.target ?? "changes";

  if (!TARGETS.includes(target)) {
    program.error(`Unknown target: ${target}. Use ${TARGETS.join(", ")}.`);
  }

  if (isRunningInAgent() || isHeadless()) return runHeadlessForTarget(target, opts);

  const hasDirectOptions = Boolean(opts.message || opts.flow || opts.yes || opts.target);

  if (hasDirectOptions) {
    await runInteractiveForTarget(target, opts);
  } else {
    usePreferencesStore.setState({ browserHeaded: opts.headed ?? false });
    renderApp(opts.agent ?? "claude");
  }
});

program.parse();
