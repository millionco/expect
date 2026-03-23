import { Effect, Option } from "effect";
import { Command } from "commander";
import { render } from "ink";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./components/app.js";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, VERSION } from "./constants.js";
import { ThemeProvider } from "./components/theme-context.js";
import { loadThemeName } from "./utils/load-theme.js";
import { ChangesFor, Git, TestPlanDraft, DraftId } from "@browser-tester/supervisor";
import { runHeadless } from "./utils/run-test.js";
import type { AgentBackend } from "@browser-tester/agent";
import { useNavigationStore, Screen } from "./stores/use-navigation.js";
import { usePreferencesStore } from "./stores/use-preferences.js";
import { usePlanStore, Plan } from "./stores/use-plan-store.js";
import { queryClient } from "./query-client.js";
import { setInkInstance } from "./utils/clear-ink-display.js";
import { RegistryProvider } from "@effect/atom-react";
import { agentProviderAtom } from "./data/runtime.js";

const DEFAULT_SKIP_PLANNING = true;

const DEFAULT_INSTRUCTION =
  "Test all changes from main in the browser and verify they work correctly.";

interface CommanderOpts {
  message?: string;
  flow?: string;
  yes?: boolean;
  agent?: AgentBackend;
}

const program = new Command()
  .name("testie")
  .description("AI-powered browser testing for your changes")
  .version(VERSION, "-v, --version")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option("-f, --flow <slug>", "reuse a saved flow by its slug")
  .option("-y, --yes", "skip plan review and run immediately")
  .option("-a, --agent <provider>", "agent provider to use (claude or codex)")
  .addHelpText(
    "after",
    `
Examples:
  $ testie                                    open interactive TUI
  $ testie -m "test the login flow" -y        plan and run immediately
  $ testie branch -m "verify signup" -y       test all branch changes`,
  );

const isHeadless = () => !process.stdin.isTTY;

const renderApp = async (agent: AgentBackend) => {
  const initialTheme = loadThemeName() ?? undefined;
  process.stdout.write(ALT_SCREEN_ON);
  process.on("exit", () => process.stdout.write(ALT_SCREEN_OFF));
  const instance = render(
    <RegistryProvider initialValues={[[agentProviderAtom, Option.some(agent)]]}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider initialTheme={initialTheme}>
          <App agent={agent} />
        </ThemeProvider>
      </QueryClientProvider>
    </RegistryProvider>,
  );
  setInkInstance(instance);
  await instance.waitUntilExit();
  process.exit(0);
};

const resolveChangesFor = async (
  action: "unstaged" | "branch" | "changes" | "commit",
  commitHash?: string,
) => {
  const cwd = process.cwd();
  return Effect.runPromise(
    Effect.gen(function* () {
      const git = yield* Git;
      const mainBranch = yield* git.getMainBranch;
      const currentBranch = yield* git.getCurrentBranch;

      if (action === "commit" && commitHash) {
        return {
          changesFor: ChangesFor.makeUnsafe({
            _tag: "Commit",
            hash: commitHash,
          }),
          currentBranch,
        };
      }
      if (action === "branch") {
        return {
          changesFor: ChangesFor.makeUnsafe({ _tag: "Branch", mainBranch }),
          currentBranch,
        };
      }
      if (action === "changes") {
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

const seedStores = (opts: CommanderOpts, changesFor: ChangesFor, currentBranch: string) => {
  usePreferencesStore.setState({
    ...(opts.agent ? { agentBackend: opts.agent } : {}),
    autoRunAfterPlanning: opts.yes ?? false,
    skipPlanning: DEFAULT_SKIP_PLANNING,
  });

  if (opts.message) {
    const draft = new TestPlanDraft({
      id: DraftId.makeUnsafe(crypto.randomUUID()),
      changesFor,
      currentBranch,
      diffPreview: "",
      fileStats: [],
      instruction: opts.message,
      baseUrl: Option.none(),
      isHeadless: false,
      requiresCookies: false,
    });
    usePlanStore.setState({ plan: Plan.draft(draft) });
    useNavigationStore.setState({
      screen: Screen.Testing({ changesFor, instruction: opts.message }),
    });
  } else {
    useNavigationStore.setState({ screen: Screen.Main() });
  }
};

const runHeadlessForAction = async (
  action: "unstaged" | "branch" | "changes" | "commit",
  opts: CommanderOpts,
  commitHash?: string,
) => {
  const { changesFor } = await resolveChangesFor(action, commitHash);
  return runHeadless({
    changesFor,
    instruction: opts.message ?? DEFAULT_INSTRUCTION,
    agent: opts.agent,
  });
};

const runInteractiveForAction = async (
  action: "unstaged" | "branch" | "changes" | "commit",
  opts: CommanderOpts,
  commitHash?: string,
) => {
  const { changesFor, currentBranch } = await resolveChangesFor(action, commitHash);
  seedStores(opts, changesFor, currentBranch);
  renderApp(opts.agent ?? "claude");
};

program
  .command("unstaged")
  .description("test current unstaged changes (default)")
  .action(async () => {
    const opts = program.opts<CommanderOpts>();
    if (isHeadless()) return runHeadlessForAction("unstaged", opts);
    await runInteractiveForAction("unstaged", opts);
  });

program
  .command("branch")
  .description("test full branch diff against main")
  .action(async () => {
    const opts = program.opts<CommanderOpts>();
    if (isHeadless()) return runHeadlessForAction("branch", opts);
    await runInteractiveForAction("branch", opts);
  });

program.action(async () => {
  const opts = program.opts<CommanderOpts>();
  if (isHeadless()) return runHeadlessForAction("changes", opts);

  const hasOptions = opts.message || opts.flow || opts.yes;

  if (hasOptions) {
    await runInteractiveForAction("changes", opts);
  } else {
    renderApp(opts.agent ?? "claude");
  }
});

program.parse();
