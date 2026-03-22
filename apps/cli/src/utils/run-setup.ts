import { execSync } from "node:child_process";
import * as net from "node:net";

const COMMON_DEV_PORTS = [3000, 3001, 4173, 5173, 8080, 8000];

const PROBE_TIMEOUT_MS = 500;

interface SetupCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface SetupResult {
  ready: boolean;
  checks: SetupCheck[];
  suggestedBaseUrl: string | undefined;
}

const checkPlaywrightBrowser = (): SetupCheck => {
  try {
    const output = execSync("npx playwright install --dry-run chromium 2>&1", {
      encoding: "utf-8",
      timeout: 15_000,
    });
    const alreadyInstalled = output.includes("already installed") || output.trim() === "";
    return {
      name: "browser",
      ok: alreadyInstalled,
      detail: alreadyInstalled
        ? "Chromium is installed"
        : "Chromium not installed — run: npx playwright install chromium",
    };
  } catch {
    return {
      name: "browser",
      ok: false,
      detail: "Chromium not installed — run: npx playwright install chromium",
    };
  }
};

const checkApiKey = (): SetupCheck => {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasKey = hasAnthropic || hasOpenAi;
  const providers = [
    ...(hasAnthropic ? ["ANTHROPIC_API_KEY"] : []),
    ...(hasOpenAi ? ["OPENAI_API_KEY"] : []),
  ];
  return {
    name: "apiKey",
    ok: hasKey,
    detail: hasKey
      ? `Found: ${providers.join(", ")}`
      : "No API key found — set ANTHROPIC_API_KEY or OPENAI_API_KEY",
  };
};

const checkGitRepo = (): SetupCheck => {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    });
    return { name: "git", ok: true, detail: "Inside a git repository" };
  } catch {
    return { name: "git", ok: false, detail: "Not inside a git repository" };
  }
};

const probePort = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(PROBE_TIMEOUT_MS);
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
    socket.connect(port, "127.0.0.1");
  });

const detectDevServer = async (): Promise<SetupCheck & { suggestedUrl: string | undefined }> => {
  const explicitUrl = process.env.BROWSER_TESTER_BASE_URL;
  if (explicitUrl) {
    return {
      name: "devServer",
      ok: true,
      detail: `BROWSER_TESTER_BASE_URL is set: ${explicitUrl}`,
      suggestedUrl: explicitUrl,
    };
  }

  const results = await Promise.all(
    COMMON_DEV_PORTS.map(async (port) => ({ port, open: await probePort(port) })),
  );
  const openPort = results.find((result) => result.open);

  if (openPort) {
    const url = `http://localhost:${openPort.port}`;
    return {
      name: "devServer",
      ok: true,
      detail: `Dev server detected on port ${openPort.port}`,
      suggestedUrl: url,
    };
  }

  return {
    name: "devServer",
    ok: false,
    detail: `No dev server detected on ports ${COMMON_DEV_PORTS.join(", ")} — start your dev server or set BROWSER_TESTER_BASE_URL`,
    suggestedUrl: undefined,
  };
};

export const runSetup = async (install: boolean): Promise<SetupResult> => {
  if (install) {
    console.error("Installing Playwright Chromium...");
    try {
      execSync("npx playwright install chromium", {
        encoding: "utf-8",
        timeout: 300_000,
        stdio: "inherit",
      });
    } catch {
      console.error("Failed to install Chromium");
    }
  }

  const browserCheck = checkPlaywrightBrowser();
  const apiKeyCheck = checkApiKey();
  const gitCheck = checkGitRepo();
  const devServerCheck = await detectDevServer();

  const checks = [browserCheck, apiKeyCheck, gitCheck, devServerCheck];
  const ready = checks.every((check) => check.ok);

  return {
    ready,
    checks,
    suggestedBaseUrl: devServerCheck.suggestedUrl,
  };
};

export const printSetupReport = (result: SetupResult) => {
  console.error(
    result.ready ? "\nAll checks passed — ready to test.\n" : "\nSome checks failed:\n",
  );
  for (const check of result.checks) {
    const icon = check.ok ? "✓" : "✗";
    console.error(`  ${icon} ${check.name}: ${check.detail}`);
  }
  if (result.suggestedBaseUrl) {
    console.error(`\nSuggested base URL: ${result.suggestedBaseUrl}`);
  }
  console.error("");
};
