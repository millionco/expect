import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import which from "which";
import { Effect } from "effect";
import { ChromeNotFoundError, ChromeSpawnError, ChromeLaunchTimeoutError } from "./errors";
import { parseDevToolsActivePort } from "./utils/parse-devtools-active-port";
import {
  CDP_LAUNCH_TIMEOUT_MS,
  CDP_POLL_INTERVAL_MS,
  HEADLESS_CHROME_WINDOW_HEIGHT_PX,
  HEADLESS_CHROME_WINDOW_WIDTH_PX,
} from "./constants";

interface ChromeProcess {
  readonly process: ChildProcess;
  readonly wsUrl: string;
  readonly userDataDir: string;
  readonly tempUserDataDir: string | undefined;
}

const SYSTEM_CHROME_PATHS_DARWIN = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Arc.app/Contents/MacOS/Arc",
  "/Applications/Helium.app/Contents/MacOS/Helium",
] as const;

const SYSTEM_CHROME_NAMES_LINUX = [
  "google-chrome",
  "google-chrome-stable",
  "chromium-browser",
  "chromium",
  "brave-browser",
  "brave-browser-stable",
  "microsoft-edge",
] as const;

export const findSystemChrome = Effect.fn("Chrome.findSystemChrome")(function* () {
  const platform = os.platform();

  if (platform === "darwin") {
    for (const candidate of SYSTEM_CHROME_PATHS_DARWIN) {
      if (fs.existsSync(candidate)) {
        yield* Effect.logDebug("Found system Chrome", { path: candidate });
        return candidate;
      }
    }
  }

  if (platform === "linux") {
    for (const name of SYSTEM_CHROME_NAMES_LINUX) {
      const resolved = which.sync(name, { nothrow: true });
      if (resolved) {
        yield* Effect.logDebug("Found system Chrome", { path: resolved });
        return resolved;
      }
    }
  }

  if (platform === "win32") {
    // HACK: process.env is used for Windows system path discovery — these are
    // OS-level paths, not app configuration
    const localAppData = process.env["LOCALAPPDATA"];
    const programFiles = process.env["PROGRAMFILES"];
    const programFilesX86 = process.env["PROGRAMFILES(X86)"];

    const candidates = [
      localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      localAppData &&
        path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
      programFiles && path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      programFilesX86 &&
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      programFiles && path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      programFilesX86 &&
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ].filter((candidate): candidate is string => typeof candidate === "string");

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        yield* Effect.logDebug("Found system Chrome", { path: candidate });
        return candidate;
      }
    }
  }

  return yield* new ChromeNotFoundError();
});

const readDevToolsActivePort = (userDataDir: string) => {
  const filePath = path.join(userDataDir, "DevToolsActivePort");
  try {
    return parseDevToolsActivePort(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
};

const buildLaunchArgs = (options: {
  headless: boolean;
  userDataDir: string;
  profileDirectory?: string;
}): string[] => {
  const args = [
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-backgrounding-occluded-windows",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-hang-monitor",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-sync",
    "--disable-features=Translate",
    "--enable-features=NetworkService,NetworkServiceInProcess",
    "--metrics-recording-only",
    "--password-store=basic",
    "--use-mock-keychain",
    `--user-data-dir=${options.userDataDir}`,
  ];

  if (options.profileDirectory) {
    args.push(`--profile-directory=${options.profileDirectory}`);
  }

  if (options.headless) {
    args.push(
      "--headless=new",
      "--enable-unsafe-swiftshader",
      `--window-size=${HEADLESS_CHROME_WINDOW_WIDTH_PX},${HEADLESS_CHROME_WINDOW_HEIGHT_PX}`,
    );
  }

  if (isContainerEnvironment()) {
    args.push("--no-sandbox", "--disable-dev-shm-usage");
  }

  return args;
};

// HACK: process.env["CI"] is used for container detection — runtime environment
// introspection, not app configuration
const isContainerEnvironment = (): boolean => {
  if (process.env["CI"]) return true;
  if (os.platform() !== "linux") return false;
  if (process.getuid?.() === 0) return true;
  if (fs.existsSync("/.dockerenv")) return true;
  if (fs.existsSync("/run/.containerenv")) return true;
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf-8");
    return cgroup.includes("docker") || cgroup.includes("kubepods") || cgroup.includes("lxc");
  } catch {
    return false;
  }
};

const cleanupFailedLaunch = Effect.fn("Chrome.cleanupFailedLaunch")(function* (
  child: ChildProcess,
  tempDir: string | undefined,
) {
  yield* Effect.sync(() => child.kill()).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("Failed to kill Chrome process during cleanup", { cause }),
    ),
  );
  if (tempDir) {
    yield* Effect.sync(() => fs.rmSync(tempDir, { recursive: true, force: true })).pipe(
      Effect.catchCause((cause) =>
        Effect.logDebug("Failed to remove temp dir during cleanup", { cause }),
      ),
    );
  }
});

export const launchSystemChrome = Effect.fn("Chrome.launchSystemChrome")(function* (options: {
  headless: boolean;
  profilePath?: string;
  profileDirectory?: string;
}) {
  const chromePath = yield* findSystemChrome();

  let tempDir: string | undefined;
  if (!options.profilePath) {
    tempDir = yield* Effect.tryPromise(() =>
      fs.promises.mkdtemp(path.join(os.tmpdir(), "expect-chrome-")),
    ).pipe(Effect.catchTag("UnknownError", Effect.die));
  }

  const userDataDir = options.profilePath ?? tempDir!;

  yield* Effect.tryPromise(() =>
    fs.promises.rm(path.join(userDataDir, "DevToolsActivePort"), { force: true }),
  ).pipe(
    Effect.catchTag("UnknownError", (cause) =>
      Effect.logDebug("Failed to remove stale DevToolsActivePort", { cause }),
    ),
  );

  const args = buildLaunchArgs({
    headless: options.headless,
    userDataDir,
    profileDirectory: options.profileDirectory,
  });

  yield* Effect.logInfo("Launching system Chrome", { chromePath, userDataDir });

  const child = yield* Effect.try({
    try: (): ChildProcess =>
      spawn(chromePath, args, {
        stdio: ["ignore", "ignore", "pipe"],
        detached: false,
      }),
    catch: (cause) =>
      new ChromeSpawnError({ cause: cause instanceof Error ? cause.message : String(cause) }),
  });

  const wsUrl = yield* Effect.callback<string, ChromeLaunchTimeoutError>((resume) => {
    const deadline = Date.now() + CDP_LAUNCH_TIMEOUT_MS;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const settle = (effect: Effect.Effect<string, ChromeLaunchTimeoutError>) => {
      if (settled) return;
      settled = true;
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      child.removeListener("error", onSpawnError);
      resume(effect);
    };

    const onSpawnError = (error: Error) => {
      settle(
        Effect.fail(
          new ChromeLaunchTimeoutError({
            timeoutMs: CDP_LAUNCH_TIMEOUT_MS,
            cause: `Chrome process error: ${error.message}`,
          }),
        ),
      );
    };

    child.on("error", onSpawnError);

    const poll = () => {
      if (Date.now() > deadline) {
        settle(
          Effect.fail(
            new ChromeLaunchTimeoutError({
              timeoutMs: CDP_LAUNCH_TIMEOUT_MS,
              cause: "Timed out waiting for DevToolsActivePort",
            }),
          ),
        );
        return;
      }

      const result = readDevToolsActivePort(userDataDir);
      if (result) {
        settle(Effect.succeed(`ws://127.0.0.1:${result.port}${result.wsPath}`));
        return;
      }

      if (child.exitCode !== null) {
        settle(
          Effect.fail(
            new ChromeLaunchTimeoutError({
              timeoutMs: CDP_LAUNCH_TIMEOUT_MS,
              cause: `Chrome exited with code ${child.exitCode} before providing CDP URL`,
            }),
          ),
        );
        return;
      }

      pendingTimer = setTimeout(poll, CDP_POLL_INTERVAL_MS);
    };

    poll();

    return Effect.sync(() => {
      settled = true;
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      child.removeListener("error", onSpawnError);
    });
  }).pipe(Effect.tapError(() => cleanupFailedLaunch(child, tempDir)));

  yield* Effect.logInfo("System Chrome launched, CDP available", { wsUrl });

  return {
    process: child,
    wsUrl,
    userDataDir,
    tempUserDataDir: tempDir,
  } satisfies ChromeProcess;
});

export const killChromeProcess = Effect.fn("Chrome.killChromeProcess")(function* (
  chrome: ChromeProcess,
) {
  yield* Effect.sync(() => chrome.process.kill()).pipe(
    Effect.catchCause((cause) => Effect.logDebug("Failed to kill Chrome process", { cause })),
  );
  const tempDir = chrome.tempUserDataDir;
  if (tempDir) {
    yield* Effect.sync(() => fs.rmSync(tempDir, { recursive: true, force: true })).pipe(
      Effect.catchCause((cause) =>
        Effect.logDebug("Failed to remove temp user data dir", { cause }),
      ),
    );
  }
});
