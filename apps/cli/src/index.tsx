import { Command } from "commander";
import { render } from "ink";
import { App } from "./components/app.js";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, VERSION } from "./constants.js";
import { ThemeProvider } from "./components/theme-context.js";
import { loadThemeName } from "./utils/load-theme.js";
import { isRunningInAgent } from "@browser-tester/supervisor";
import { getCommitSummary } from "@browser-tester/supervisor";
import { autoDetectAndTest, runTest } from "./utils/run-test.js";
import { runHealthcheckHeadless, runHealthcheckInteractive } from "./utils/run-healthcheck.js";
import { useAppStore, type Screen } from "./store.js";
import { resolveTestRunConfig, type TestRunConfig } from "./utils/test-run-config.js";
import {
  getBrowserEnvironment,
  resolveBrowserTarget,
  type TestAction,
} from "./utils/browser-agent.js";
import { loadSavedFlowBySlug } from "./utils/load-saved-flow.js";
import { setInkInstance } from "./utils/clear-ink-display.js";

const program = new Command()
  .name("testie")
  .description("AI-powered browser testing for your changes")
  .version(VERSION, "-v, --version")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option("-f, --flow <slug>", "reuse a saved flow by its slug")
  .option("-y, --yes", "skip plan review and run immediately")
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
  $ testie -f my-flow                         reuse a saved flow

Environment variables:
  BROWSER_TESTER_BASE_URL     base URL for the browser (e.g. http://localhost:3000)
  BROWSER_TESTER_HEADED       run headed by default (true | 1)
  BROWSER_TESTER_COOKIES      enable cookie sync by default (true | 1)`,
  );

const isHeadless = () => isRunningInAgent() || !process.stdin.isTTY;

const renderApp = () => {
  const initialTheme = loadThemeName() ?? undefined;
  process.stdout.write(ALT_SCREEN_ON);
  process.on("exit", () => process.stdout.write(ALT_SCREEN_OFF));
  const instance = render(
    <ThemeProvider initialTheme={initialTheme}>
      <App />
    </ThemeProvider>,
  );
  setInkInstance(instance);
  process.stdout.on("resize", () => {
    instance.clear();
  });
};

const resolveInitialScreen = (config: TestRunConfig, hasSavedFlow: boolean): Screen => {
  if (hasSavedFlow) return config.autoRun ? "testing" : "review-plan";
  if (config.message) return "planning";
  return "main";
};

const seedStoreFromConfig = async (config: TestRunConfig): Promise<void> => {
  const resolvedCommit =
    config.action === "select-commit" && config.commitHash
      ? (getCommitSummary(process.cwd(), config.commitHash) ?? null)
      : null;

  const savedFlow = config.flowSlug ? await loadSavedFlowBySlug(config.flowSlug) : null;

  const screen = resolveInitialScreen(config, Boolean(savedFlow));

  useAppStore.setState({
    screen,
    testAction: config.action,
    selectedCommit: resolvedCommit,
    autoRunAfterPlanning: config.autoRun ?? false,
    environmentOverrides: config.environmentOverrides,
    ...(config.message && { flowInstruction: config.message }),
    ...(savedFlow && {
      generatedPlan: savedFlow.plan,
      resolvedTarget: resolveBrowserTarget({
        action: config.action,
        commit: resolvedCommit ?? undefined,
      }),
      browserEnvironment: {
        ...getBrowserEnvironment(config.environmentOverrides),
        ...savedFlow.environment,
      },
      planOrigin: "saved" as const,
    }),
    ...(!savedFlow && config.message && { planOrigin: "generated" as const }),
  });
};

const createCommandAction =
  (action: TestAction) =>
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
      runHealthcheckHeadless();
      return;
    }
    const { shouldTest, scope } = await runHealthcheckInteractive();
    if (!shouldTest) return;
    const action = scope === "entire-branch" ? "test-branch" : "test-unstaged";
    const config = resolveTestRunConfig(action, program.opts());
    await seedStoreFromConfig(config);
    renderApp();
  });

program
  .command("unstaged")
  .description("test current unstaged changes (default)")
  .action(createCommandAction("test-unstaged"));

program
  .command("branch")
  .description("test full branch diff against main")
  .action(createCommandAction("test-branch"));

program.action(async () => {
  const config = resolveTestRunConfig("test-unstaged", program.opts());
  if (isHeadless()) return autoDetectAndTest(config);
  if (config.message || config.flowSlug || config.autoRun || config.environmentOverrides) {
    await seedStoreFromConfig(config);
  }
  renderApp();
});

program.parse();
