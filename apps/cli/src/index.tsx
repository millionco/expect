import { Effect } from "effect";
import { Command, InvalidOptionArgumentError } from "commander";
import { render } from "ink";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./components/app.js";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, VERSION } from "./constants.js";
import { ThemeProvider } from "./components/theme-context.js";
import { loadThemeName } from "./utils/load-theme.js";
import { ChangesFor, Git } from "@browser-tester/supervisor";
import { autoDetectAndTest, runTest } from "./utils/run-test.js";
import { runHealthcheckHeadless, runHealthcheckInteractive } from "./utils/run-healthcheck.js";
import { useNavigationStore, type Screen } from "./stores/use-navigation.js";
import { usePreferencesStore } from "./stores/use-preferences.js";
import { useFlowSessionStore } from "./stores/use-flow-session.js";
import { queryClient } from "./query-client.js";
import {
  resolveTestRunConfig,
  type TestRunConfig,
  type AgentProvider,
} from "./utils/test-run-config.js";
import { setInkInstance } from "./utils/clear-ink-display.js";

const DEFAULT_SKIP_PLANNING = true;

const parseAgentProvider = (value: string): AgentProvider => {
  if (value === "claude" || value === "codex" || value === "cursor") {
    return value;
  }

  throw new InvalidOptionArgumentError(
    `Unsupported agent "${value}". Use one of: claude, codex, cursor.`,
  );
};

const program = new Command()
  .name("testie")
  .description("AI-powered browser testing for your changes")
  .version(VERSION, "-v, --version")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option("-f, --flow <slug>", "reuse a saved flow by its slug")
  .option("-y, --yes", "skip plan review and run immediately")
  .option(
    "--planner <provider>",
    "agent for planning (claude, codex, cursor)",
    parseAgentProvider,
    "codex",
  )
  .option(
    "--executor <provider>",
    "agent for execution (claude, codex, cursor)",
    parseAgentProvider,
    "codex",
  )
  .option("--planning-model <model>", "specific model for the planning agent", "composer-1.5")
  .option("--execution-model <model>", "specific model for the execution agent", "composer-1.5")
  .option("--base-url <url>", "browser base URL (overrides BROWSER_TESTER_BASE_URL)")
  .option("--headed", "run browser visibly instead of headless")
  .option("--cookies", "sync cookies from your browser profile")
  .option("--no-cookies", "disable cookie sync")
  .addHelpText(
    "after",
    `
Examples:
  $ testie                                    open interactive TUI
  $ testie -m "test the login flow" -y        plan and run immediately
  $ testie branch -m "verify signup" -y       test all branch changes

Environment variables:
  BROWSER_TESTER_BASE_URL     base URL for the browser (e.g. http://localhost:3000)
  BROWSER_TESTER_HEADED       run headed by default (true | 1)
  BROWSER_TESTER_COOKIES      enable cookie sync by default (true | 1)`,
  );

const isHeadless = () => !process.stdin.isTTY;

const renderApp = () => {
  const initialTheme = loadThemeName() ?? undefined;
  process.stdout.write(ALT_SCREEN_ON);
  process.on("exit", () => process.stdout.write(ALT_SCREEN_OFF));
  const instance = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialTheme={initialTheme}>
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  setInkInstance(instance);
};

const resolveInitialScreen = (config: TestRunConfig): Screen => {
  if (config.message) return DEFAULT_SKIP_PLANNING ? "testing" : "planning";
  return "main";
};

const resolveChangesFor = async (config: TestRunConfig) => {
  const cwd = process.cwd();
  return Effect.runPromise(
    Effect.gen(function* () {
      const git = yield* Git;
      const mainBranch = yield* git.getMainBranch;

      if (config.action === "commit" && config.commitHash) {
        const commit = yield* git.getCommitSummary(config.commitHash);
        return {
          changesFor: ChangesFor.Commit({ hash: config.commitHash }),
          selectedCommit: commit ?? undefined,
        };
      }
      if (config.action === "branch") {
        return { changesFor: ChangesFor.Branch({ mainBranch }), selectedCommit: undefined };
      }
      if (config.action === "changes") {
        return { changesFor: ChangesFor.Changes({ mainBranch }), selectedCommit: undefined };
      }
      return { changesFor: ChangesFor.WorkingTree(), selectedCommit: undefined };
    }).pipe(Effect.provide(Git.withRepoRoot(cwd))),
  );
};

const seedStoreFromConfig = async (config: TestRunConfig): Promise<void> => {
  const { changesFor, selectedCommit } = await resolveChangesFor(config);
  const screen = resolveInitialScreen(config);

  useNavigationStore.setState({ screen });
  usePreferencesStore.setState({
    autoRunAfterPlanning: config.autoRun ?? false,
    skipPlanning: DEFAULT_SKIP_PLANNING,
    planningProvider: config.planningProvider,
    executionProvider: config.executionProvider,
    planningModel: config.planningModel,
    executionModel: config.executionModel,
    environmentOverrides: config.environmentOverrides,
  });
  useFlowSessionStore.setState({
    changesFor,
    selectedCommit: selectedCommit ?? null,
    ...(config.message && { flowInstruction: config.message }),
    ...(!config.message && { planOrigin: "generated" as const }),
  });
};

const createCommandAction =
  (action: TestRunConfig["action"]) =>
  async (commitHash?: string): Promise<void> => {
    const config = resolveTestRunConfig(action, program.opts(), commitHash);
    if (isHeadless()) return runTest(config);
    await seedStoreFromConfig(config);
    renderApp();
  };

program
  .command("healthcheck")
  .description("check for untested changes")
  .action(async () => {
    if (isHeadless()) {
      await runHealthcheckHeadless();
      return;
    }
    const { shouldTest, scope } = await runHealthcheckInteractive();
    if (!shouldTest) return;
    const actionByScope: Record<string, TestRunConfig["action"]> = {
      changes: "changes",
      "unstaged-changes": "unstaged",
      "entire-branch": "branch",
      default: "changes",
    };
    const action = actionByScope[scope] ?? "changes";
    const config = resolveTestRunConfig(action, program.opts());
    await seedStoreFromConfig(config);
    renderApp();
  });

program
  .command("unstaged")
  .description("test current unstaged changes (default)")
  .action(createCommandAction("unstaged"));

program
  .command("branch")
  .description("test full branch diff against main")
  .action(createCommandAction("branch"));

program.action(async () => {
  const config = resolveTestRunConfig("changes", program.opts());
  if (isHeadless()) return autoDetectAndTest(config);
  if (
    config.message ||
    config.flowSlug ||
    config.autoRun ||
    config.environmentOverrides ||
    config.planningProvider ||
    config.executionProvider ||
    config.planningModel ||
    config.executionModel
  ) {
    await seedStoreFromConfig(config);
  }
  renderApp();
});

program.parse();
