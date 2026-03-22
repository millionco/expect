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
import { runSetup, printSetupReport } from "./utils/run-setup.js";
import type { AgentBackend } from "@browser-tester/agent";
import { useNavigationStore, Screen } from "./stores/use-navigation.js";
import { usePreferencesStore } from "./stores/use-preferences.js";
import { usePlanStore, Plan } from "./stores/use-plan-store.js";
import { queryClient } from "./query-client.js";
import { setInkInstance } from "./utils/clear-ink-display.js";

const DEFAULT_SKIP_PLANNING = true;

const DEFAULT_INSTRUCTION =
  "Test all changes from main in the browser and verify they work correctly.";

interface CommanderOpts {
  message?: string;
  flow?: string;
  yes?: boolean;
  agent?: AgentBackend;
  json?: boolean;
  baseUrl?: string;
}

const program = new Command()
  .name("testie")
  .description("AI-powered browser testing for your changes")
  .version(VERSION, "-v, --version")
  .option("-m, --message <instruction>", "natural language instruction for what to test")
  .option("-f, --flow <slug>", "reuse a saved flow by its slug")
  .option("-y, --yes", "skip plan review and run immediately")
  .option("-a, --agent <provider>", "agent provider to use (claude or codex)")
  .option("--json", "output structured JSON to stdout (headless mode)")
  .option("--base-url <url>", "browser base URL (e.g. http://localhost:3000)")
  .addHelpText(
    "after",
    `
Examples:
  $ testie                                    open interactive TUI
  $ testie -m "test the login flow" -y        plan and run immediately
  $ testie branch -m "verify signup" -y       test all branch changes`,
  );

const isHeadless = () => !process.stdin.isTTY;

const renderApp = async () => {
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
          changesFor: ChangesFor.makeUnsafe({ _tag: "Commit", hash: commitHash }),
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
    usePlanStore.setState({ plan: Plan.draft(draft), readyTestPlan: undefined });
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
    json: opts.json,
    baseUrl: opts.baseUrl,
  });
};

const runInteractiveForAction = async (
  action: "unstaged" | "branch" | "changes" | "commit",
  opts: CommanderOpts,
  commitHash?: string,
) => {
  const { changesFor, currentBranch } = await resolveChangesFor(action, commitHash);
  seedStores(opts, changesFor, currentBranch);
  renderApp();
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

program
  .command("setup")
  .description("check and install prerequisites for browser testing")
  .option("--install", "auto-install missing prerequisites (e.g. Chromium)")
  .action(async (setupOpts: { install?: boolean }) => {
    const result = await runSetup(setupOpts.install ?? false);
    if (isHeadless()) {
      console.log(JSON.stringify(result, undefined, 2));
    } else {
      printSetupReport(result);
    }
    process.exitCode = result.ready ? 0 : 1;
  });

program
  .command("agent")
  .description("single-command entry point for AI agents: setup + test + JSON output")
  .option("--install", "auto-install missing prerequisites before testing")
  .option("--scope <scope>", "test scope: unstaged, branch, or changes", "changes")
  .action(async (agentOpts: { install?: boolean; scope?: string }) => {
    const opts = program.opts<CommanderOpts>();
    const scope = (agentOpts.scope ?? "changes") as "unstaged" | "branch" | "changes";

    const setupResult = await runSetup(agentOpts.install ?? false);
    if (!setupResult.ready) {
      console.log(
        JSON.stringify({ status: "setup-failed", checks: setupResult.checks }, undefined, 2),
      );
      process.exitCode = 1;
      return;
    }

    const effectiveBaseUrl = opts.baseUrl ?? setupResult.suggestedBaseUrl;
    const { changesFor } = await resolveChangesFor(scope);
    return runHeadless({
      changesFor,
      instruction: opts.message ?? DEFAULT_INSTRUCTION,
      agent: opts.agent,
      json: true,
      baseUrl: effectiveBaseUrl,
    });
  });

program.action(async () => {
  const opts = program.opts<CommanderOpts>();
  if (isHeadless()) return runHeadlessForAction("changes", opts);

  const hasOptions = opts.message || opts.flow || opts.yes;

  if (hasOptions) {
    await runInteractiveForAction("changes", opts);
  } else {
    renderApp();
  }
});

program.parse();
