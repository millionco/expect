import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { detectAvailableAgents, toDisplayName } from "@expect/agent";
import { BROWSER_CONFIGS } from "@expect/cookies";
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
import {
  formatExpectMcpInstallSummary,
  getSupportedExpectMcpAgents,
  getUnsupportedExpectMcpAgents,
  installExpectMcpForAgents,
  selectExpectMcpAgents,
  selectExpectMcpInstallScope,
} from "../mcp/install-expect-mcp";

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
  "Use Expect to test my changes in the browser",
  "Use Expect to smoke test the app end to end",
  "Use Expect to check for regressions after my changes",
];

const logUsageGuide = () => {
  logger.break();
  logger.log("  Restart your coding agent if it was already running, then try one of these:");
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
  const supportedMcpAgents = getSupportedExpectMcpAgents(availableAgents);
  const unsupportedMcpAgents = getUnsupportedExpectMcpAgents(availableAgents);

  if (supportedMcpAgents.length === 0) {
    logger.error(
      "No supported coding agent found for Expect MCP. Expect MCP currently supports Claude Code, Codex, GitHub Copilot, Gemini CLI, Cursor, and OpenCode.",
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

  const projectRoot = await resolveProjectRoot();

  if (unsupportedMcpAgents.length > 0) {
    logger.warn(
      `  Skipping MCP install for ${unsupportedMcpAgents.map(toDisplayName).join(", ")}.`,
    );
    logger.break();
  }

  if (options.dry) {
    spinner("Installing Expect MCP...").start().succeed("Expect MCP installed (dry run).");
  } else {
    const scope = await selectExpectMcpInstallScope(options.yes);
    const selectedAgents = await selectExpectMcpAgents(supportedMcpAgents, options.yes, scope);
    const mcpSpinner = spinner("Installing Expect MCP...").start();
    const installSummary = installExpectMcpForAgents(projectRoot, selectedAgents, { scope });

    if (
      installSummary.selectedAgents.length > 0 &&
      installSummary.failed.length === installSummary.selectedAgents.length
    ) {
      mcpSpinner.fail("Failed to install Expect MCP.");
      for (const failure of installSummary.failed) {
        logger.warn(`  ${toDisplayName(failure.agent)}: ${failure.reason}`);
      }
      throw new Error("Failed to install Expect MCP.");
    }

    if (installSummary.selectedAgents.length === 0) {
      mcpSpinner.warn("Skipped Expect MCP install.");
    } else {
      mcpSpinner.succeed(formatExpectMcpInstallSummary(installSummary));
      for (const failure of installSummary.failed) {
        logger.warn(`  ${toDisplayName(failure.agent)}: ${failure.reason}`);
      }
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
    writeProjectPreference(projectRoot, "browserMode", browserMode);
  }

  logger.break();
  logger.success("Setup complete!");
  logUsageGuide();
};
