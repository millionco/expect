import { Command } from "commander";
import { render } from "ink";
import { App } from "./app.js";
import { VERSION } from "./constants.js";
import { ThemeProvider } from "./theme-context.js";
import { loadThemeName } from "./utils/load-theme.js";
import { isAutomatedEnvironment } from "./utils/is-automated-environment.js";
import { autoDetectAndTest, runTest } from "./utils/run-test.js";
import { fetchCommits } from "./utils/fetch-commits.js";
import { useAppStore } from "./store.js";

const program = new Command()
  .name("testie")
  .description("AI-powered browser testing for your changes")
  .version(VERSION, "-v, --version");

const renderApp = () => {
  const initialTheme = loadThemeName() ?? undefined;
  render(
    <ThemeProvider initialTheme={initialTheme}>
      <App />
    </ThemeProvider>,
  );
};

program
  .command("unstaged")
  .description("Test unstaged changes")
  .action(() => {
    if (isAutomatedEnvironment() || !process.stdin.isTTY) {
      return runTest("test-unstaged");
    }
    useAppStore.setState({ testAction: "test-unstaged", screen: "flow-input" });
    renderApp();
  });

program
  .command("branch")
  .description("Test entire branch diff against main")
  .action(() => {
    if (isAutomatedEnvironment() || !process.stdin.isTTY) {
      return runTest("test-branch");
    }
    useAppStore.setState({ testAction: "test-branch", screen: "flow-input" });
    renderApp();
  });

program
  .command("commit")
  .description("Test a specific commit")
  .argument("[hash]", "commit hash")
  .action((hash: string | undefined) => {
    if (isAutomatedEnvironment() || !process.stdin.isTTY) {
      return runTest("select-commit", hash);
    }
    const initialCommit = hash
      ? fetchCommits().find(
          (candidate) => candidate.shortHash === hash || candidate.hash.startsWith(hash),
        )
      : undefined;
    useAppStore.setState({
      testAction: "select-commit",
      selectedCommit: initialCommit ?? null,
      screen: initialCommit ? "flow-input" : "select-commit",
    });
    renderApp();
  });

program.action(() => {
  if (isAutomatedEnvironment() || !process.stdin.isTTY) {
    return autoDetectAndTest();
  }
  renderApp();
});

program.parse();
