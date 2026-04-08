import * as childProcess from "node:child_process";
import { detectAvailableAgents } from "@expect/agent";
import { isCommandAvailable } from "@expect/shared/is-command-available";
import figures from "figures";
import pc from "picocolors";
import { VERSION } from "../constants";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts, setOnCancel } from "../utils/prompts";
import { spinner } from "../utils/spinner";
import {
  type BrowserMode,
  isValidBrowserMode,
  writeProjectPreference,
} from "../utils/project-preferences-io";
import { resolveProjectRoot } from "../utils/project-root";
import { runAddSkill } from "./add-skill";
import { detectPackageManager } from "./init-utils";
import { formatInstallCommand, getGlobalInstallCommand, runInstallCommand } from "./update";

export { detectAvailableAgents };

interface InitOptions {
  yes?: boolean;
  dry?: boolean;
  headed?: boolean;
  headless?: boolean;
}

const USAGE_PROMPTS = [
  "Run /expect to test my changes in the browser",
  "Run /expect to smoke test the app end to end",
  "Run /expect to check for regressions after my changes",
];

const logUsageGuide = () => {
  logger.break();
  logger.log("  Copy one of these into your coding agent to get started:");
  logger.break();
  for (const prompt of USAGE_PROMPTS) {
    logger.log(`     ${highlighter.info(prompt)}`);
  }
  logger.break();
};

const resolveBrowserModeFromFlags = (options: InitOptions): BrowserMode | undefined => {
  if (options.headed && options.headless) {
    logger.warn("  Both --headed and --headless passed. Using --headed.");
    return "headed";
  }
  if (options.headed) return "headed";
  if (options.headless) return "headless";
  return undefined;
};

const promptBrowserMode = async (flagMode: BrowserMode | undefined): Promise<BrowserMode> => {
  if (flagMode) return flagMode;

  const response = await prompts({
    type: "select",
    name: "browserMode",
    message: "How should Expect launch the browser?",
    choices: [
      {
        title: "Open a browser window (recommended)",
        description: "Launches a visible browser for each test run",
        value: "headed",
      },
      {
        title: "Run headless",
        description: "No visible browser — best for CI and agents",
        value: "headless",
      },
    ],
    initial: 0,
  });

  const selected: unknown = response.browserMode;
  return isValidBrowserMode(selected) ? selected : "headed";
};

export const runInit = async (options: InitOptions = {}) => {
  const packageManager = detectPackageManager();
  const installCommand = getGlobalInstallCommand(packageManager);

  setOnCancel(() => {
    logger.break();
    logger.log("Cancelled.");
    logUsageGuide();
    process.exit(0);
  });

  logger.break();
  logger.log(
    `  ${pc.red(figures.cross)}${pc.green(figures.tick)} ${pc.bold("Expect")} ${highlighter.dim(`v${VERSION}`)}`,
  );
  logger.dim("  Let agents test your code in a real browser.");
  logger.break();

  const availableAgents = detectAvailableAgents();

  if (availableAgents.length === 0) {
    logger.error(
      "No supported coding agent found. expect requires one of: Claude Code, Codex, GitHub Copilot, Gemini, Cursor, OpenCode, Factory Droid, or Pi.",
    );
    logger.break();
    logger.log(`  Install one to get started:`);
    logger.log(
      `    ${highlighter.info("Claude Code")}      ${highlighter.dim("https://docs.anthropic.com/en/docs/claude-code")}`,
    );
    logger.log(
      `    ${highlighter.info("Codex")}            ${highlighter.dim("https://github.com/openai/codex")}`,
    );
    logger.log(
      `    ${highlighter.info("GitHub Copilot")}   ${highlighter.dim("npm install -g @github/copilot")}`,
    );
    logger.log(
      `    ${highlighter.info("Gemini")}           ${highlighter.dim("npm install -g @google/gemini-cli")}`,
    );
    logger.log(
      `    ${highlighter.info("Cursor")}           ${highlighter.dim("https://cursor.com")}`,
    );
    logger.log(
      `    ${highlighter.info("OpenCode")}         ${highlighter.dim("npm install -g opencode-ai")}`,
    );
    logger.log(
      `    ${highlighter.info("Factory Droid")}    ${highlighter.dim("npm install -g droid")}`,
    );
    logger.log(
      `    ${highlighter.info("Pi")}               ${highlighter.dim("npm install -g @mariozechner/pi-coding-agent")}`,
    );
    logger.break();
    process.exit(1);
  }

  if (options.dry) {
    spinner("Installing expect skill...").start().succeed("Skill installed (dry run).");
  } else {
    await runAddSkill({ yes: options.yes, agents: availableAgents });
  }

  logger.break();

  const globalSpinner = spinner("Installing expect-cli globally...").start();
  if (options.dry) {
    globalSpinner.succeed(`Installed expect-cli globally (dry run).`);
  } else {
    const globalSuccess = await runInstallCommand(installCommand);

    if (globalSuccess) {
      if (isCommandAvailable("expect-cli")) {
        globalSpinner.succeed(
          `Installed! ${highlighter.info("expect-cli")} is now available globally.`,
        );
      } else {
        globalSpinner.warn(`Installed, but ${highlighter.info("expect-cli")} is not on your PATH.`);
        const globalPrefix = childProcess
          .spawnSync("npm", ["prefix", "-g"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          })
          .stdout?.trim();
        if (globalPrefix) {
          logger.dim(
            `  Add ${highlighter.info(`${globalPrefix}/bin`)} to your PATH, or use ${highlighter.info("npx expect-cli")} instead.`,
          );
        } else {
          logger.dim(`  Use ${highlighter.info("npx expect-cli")} instead.`);
        }
      }
    } else {
      globalSpinner.fail("Failed to install globally.");
      logger.dim(`  Run manually: ${highlighter.info(formatInstallCommand(installCommand))}`);
    }
  }

  logger.break();

  const nonInteractive = Boolean(options.yes);
  const flagMode = resolveBrowserModeFromFlags(options);
  const browserMode = nonInteractive ? (flagMode ?? "headed") : await promptBrowserMode(flagMode);

  if (!options.dry) {
    writeProjectPreference(await resolveProjectRoot(), "browserMode", browserMode);
  }

  logger.break();
  logger.success("Setup complete!");
  logUsageGuide();
};
