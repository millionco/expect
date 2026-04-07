import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { detectAvailableAgents } from "@expect/agent";
import { isCommandAvailable } from "@expect/shared/is-command-available";
import { BROWSER_CONFIGS } from "@expect/cookies";
import figures from "figures";
import pc from "picocolors";
import { VERSION } from "../constants";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import { prompts, setOnCancel } from "../utils/prompts";
import { spinner } from "../utils/spinner";
import { type BrowserMode, isValidBrowserMode, writeExpectConfig } from "../utils/expect-config";
import { resolveProjectRoot } from "../utils/project-root";
import { runAddSkill } from "./add-skill";
import { detectPackageManager } from "./init-utils";
import { formatInstallCommand, getGlobalInstallCommand, runInstallCommand } from "./update";

export { detectAvailableAgents };

interface InitOptions {
  yes?: boolean;
  dry?: boolean;
  cdp?: boolean;
  headed?: boolean;
  headless?: boolean;
}

const CDP_PROBE_PORTS = [9222, 9229] as const;
const CDP_PROBE_TIMEOUT_MS = 500;
const CDP_INSPECT_MIN_MAJOR_VERSION = 144;
const CHROME_VERSION_TIMEOUT_MS = 5_000;
const CHROME_VERSION_PATTERN = /(\d+)\.\d+\.\d+\.\d+/;

const existsSync = (filePath: string): boolean => {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
};

export const findSystemChromePath = (
  fileExists: (filePath: string) => boolean = existsSync,
): string | undefined => {
  const platform = os.platform();
  const chromeConfig = BROWSER_CONFIGS.find((config) => config.key === "chrome");
  if (!chromeConfig || chromeConfig.kind !== "chromium") return undefined;

  if (platform === "darwin") {
    return fileExists(chromeConfig.executable.darwin) ? chromeConfig.executable.darwin : undefined;
  }

  if (platform === "linux") {
    for (const candidate of chromeConfig.executable.linux) {
      if (fileExists(candidate)) return candidate;
    }
  }

  if (platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    const programFiles = process.env["PROGRAMFILES"];
    const programFilesX86 = process.env["PROGRAMFILES(X86)"];
    const prefixes = [localAppData, programFiles, programFilesX86].filter(
      (prefix): prefix is string => typeof prefix === "string",
    );

    for (const prefix of prefixes) {
      for (const relative of chromeConfig.executable.win32) {
        const absolute = path.join(prefix, relative);
        if (fileExists(absolute)) return absolute;
      }
    }
  }

  return undefined;
};

export const getChromeMajorVersion = (
  chromePath?: string,
  runCommand: (binary: string) => string | undefined = (binary) => {
    const result = spawnSync(binary, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: CHROME_VERSION_TIMEOUT_MS,
    });
    return result.stdout ?? undefined;
  },
): number | undefined => {
  const resolvedPath = chromePath ?? findSystemChromePath();
  if (!resolvedPath) return undefined;

  try {
    const stdout = runCommand(resolvedPath);
    const match = stdout?.match(CHROME_VERSION_PATTERN);
    return match ? parseInt(match[1], 10) : undefined;
  } catch {
    return undefined;
  }
};

const supportsInspectDebugging = (): boolean => {
  const major = getChromeMajorVersion();
  return major !== undefined && major >= CDP_INSPECT_MIN_MAJOR_VERSION;
};

const isPortReachable = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(CDP_PROBE_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });

const probeCdpPorts = async (): Promise<number | undefined> => {
  for (const port of CDP_PROBE_PORTS) {
    if (await isPortReachable("127.0.0.1", port)) return port;
  }
  return undefined;
};

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

const CDP_SUPPORTED_BROWSERS = BROWSER_CONFIGS.filter((config) => config.kind === "chromium").map(
  (config) => config.displayName,
);

const resolveBrowserModeFromFlags = (options: InitOptions): BrowserMode | undefined => {
  const flags: BrowserMode[] = [];
  if (options.cdp) flags.push("cdp");
  if (options.headed) flags.push("headed");
  if (options.headless) flags.push("headless");

  if (flags.length > 1) {
    logger.warn(`  Multiple browser mode flags passed (${flags.join(", ")}). Using --${flags[0]}.`);
  }

  return flags[0];
};

const promptBrowserMode = async (flagMode: BrowserMode | undefined): Promise<BrowserMode> => {
  if (flagMode) return flagMode;
  logger.log(`  CDP supported browsers: ${highlighter.dim(CDP_SUPPORTED_BROWSERS.join(", "))}`);
  logger.break();

  const response = await prompts({
    type: "select",
    name: "browserMode",
    message: "How should Expect connect to a browser?",
    choices: [
      {
        title: "Connect to my browser (recommended)",
        description: "Tests run in your existing browser session with your cookies and logins",
        value: "cdp",
      },
      {
        title: "Open a browser window",
        description: "Launches a fresh browser for each test run",
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
  return isValidBrowserMode(selected) ? selected : "cdp";
};

const getCdpLaunchCommand = (): string => {
  const platform = os.platform();
  const chromeConfig = BROWSER_CONFIGS.find((config) => config.key === "chrome");
  if (!chromeConfig || chromeConfig.kind !== "chromium") {
    return "google-chrome --remote-debugging-port=9222";
  }
  if (platform === "darwin") {
    return `${chromeConfig.executable.darwin.replace(/ /g, "\\ ")} --remote-debugging-port=9222`;
  }
  if (platform === "win32") {
    return `start ${chromeConfig.executable.win32[0]?.split("\\").pop() ?? "chrome.exe"} --remote-debugging-port=9222`;
  }
  return `${chromeConfig.executable.linux[0]?.split("/").pop() ?? "google-chrome"} --remote-debugging-port=9222`;
};

const CDP_RETRY_DELAY_MS = 3000;
const CDP_MAX_RETRIES = 20;

const waitForCdp = async (): Promise<number | undefined> => {
  for (let attempt = 0; attempt < CDP_MAX_RETRIES; attempt++) {
    const port = await probeCdpPorts();
    if (port) return port;
    await new Promise((resolve) => setTimeout(resolve, CDP_RETRY_DELAY_MS));
  }
  return undefined;
};

const handleCdpSetup = async (fromFlag: boolean): Promise<boolean> => {
  const probeSpinner = spinner("Looking for a browser with DevTools Protocol...").start();
  const port = await probeCdpPorts();

  if (port) {
    probeSpinner.succeed(`Found browser with CDP on port ${port}.`);
    return true;
  }

  if (fromFlag) {
    probeSpinner.fail("No browser with CDP detected. Falling back to headless mode.");
    logger.dim(`  Launch Chrome with: ${highlighter.info(getCdpLaunchCommand())}`);
    return false;
  }

  probeSpinner.warn("No browser with CDP detected.");
  logger.break();

  if (supportsInspectDebugging()) {
    logger.log(`  Open this URL in Chrome to enable remote debugging:`);
    logger.break();
    logger.log(`     ${highlighter.info("chrome://inspect/#remote-debugging")}`);
    logger.break();
    logger.log(`  ${highlighter.dim("Allow the connection when prompted, then come back here.")}`);
  } else {
    logger.log(`  Launch your browser with the debug flag:`);
    logger.break();
    logger.log(`     ${highlighter.dim("$")} ${highlighter.info(getCdpLaunchCommand())}`);
  }
  logger.break();

  const waitSpinner = spinner("Waiting for browser connection...").start();
  const retryPort = await waitForCdp();

  if (retryPort) {
    waitSpinner.succeed(`Connected to browser on port ${retryPort}.`);
    return true;
  }

  waitSpinner.fail("Timed out waiting for browser. Falling back to headless mode.");
  return false;
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
      "No supported coding agent found. expect requires one of: Claude Code, Codex, GitHub Copilot, Gemini, Cursor, OpenCode, or Factory Droid.",
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
        const globalPrefix = spawnSync("npm", ["prefix", "-g"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).stdout?.trim();
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

  const flagMode = resolveBrowserModeFromFlags(options);
  let browserMode = await promptBrowserMode(flagMode);

  if (browserMode === "cdp") {
    const cdpAvailable = await handleCdpSetup(Boolean(flagMode));
    if (!cdpAvailable) {
      browserMode = "headless";
    }
  }

  if (!options.dry) {
    writeExpectConfig(await resolveProjectRoot(), { browserMode });
  }

  logger.break();
  logger.success("Setup complete!");
  logUsageGuide();
};
