import { spawn, spawnSync } from "node:child_process";
import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { isCommandAvailable } from "@expect/agent";
import {
  CLAUDE_SETUP_TOKEN_TIMEOUT_MS,
  GH_CLI_DETECT_TIMEOUT_MS,
  GH_SECRET_SET_TIMEOUT_MS,
  GIT_REMOTE_TIMEOUT_MS,
} from "../constants";
import { isRunningInAgent } from "../utils/is-running-in-agent";
import { isHeadless } from "../utils/is-headless";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "vp";

export const detectPackageManager = (): PackageManager => {
  if (process.env.VITE_PLUS_CLI_BIN) return "vp";

  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    if (userAgent.startsWith("pnpm")) return "pnpm";
    if (userAgent.startsWith("yarn")) return "yarn";
    if (userAgent.startsWith("bun")) return "bun";
    if (userAgent.startsWith("npm")) return "npm";
  }
  return "npm";
};

export const detectNonInteractive = (yesFlag: boolean): boolean =>
  yesFlag || isRunningInAgent() || isHeadless();

export const hasGitHubRemote = Effect.tryPromise({
  try: () =>
    new Promise<string>((resolve, reject) => {
      const child = spawn("git", ["remote", "-v"], { stdio: ["ignore", "pipe", "ignore"] });
      let stdout = "";
      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git remote exited with ${code}`));
      });
      child.on("error", reject);
    }),
  catch: () => new Error("Failed to detect git remote"),
}).pipe(
  Effect.map((stdout) => stdout.includes("github.com")),
  Effect.timeout(GIT_REMOTE_TIMEOUT_MS),
  Effect.orElseSucceed(() => false),
);

export const hasGhCli = Effect.sync(() => isCommandAvailable("gh"));

export const isGithubCliAuthenticated = Effect.try({
  try: () =>
    spawnSync("gh", ["auth", "status"], {
      stdio: "ignore",
      timeout: GH_CLI_DETECT_TIMEOUT_MS,
    }).status === 0,
  catch: () => ({ _tag: "GhAuthCheckError" as const }),
}).pipe(Effect.catchTag("GhAuthCheckError", () => Effect.succeed(false)));

const INSTALL_TIMEOUT_MS = 60_000;

export const tryRun = (command: string): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: "ignore",
      timeout: INSTALL_TIMEOUT_MS,
    });
    child.on("close", (code) => {
      resolve(code === 0);
    });
    child.on("error", () => {
      resolve(false);
    });
  });

const CLAUDE_TOKEN_PATTERN = /^(sk-ant-\S+)$/m;
const ESC = String.fromCharCode(0x1b);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, "g");

const stripAnsi = (text: string): string => text.replace(ANSI_ESCAPE_PATTERN, "");

const encoder = new TextEncoder();

export const generateClaudeToken = Effect.gen(function* () {
  const handle = yield* ChildProcess.make("claude", ["setup-token"], {
    stdin: "inherit",
    stdout: "pipe",
    stderr: "inherit",
  });

  let stdout = "";
  yield* handle.stdout.pipe(
    Stream.decodeText(),
    Stream.runForEach((text) =>
      Effect.sync(() => {
        stdout += text;
        process.stdout.write(text);
      }),
    ),
  );

  const exitCode = yield* handle.exitCode;
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* Effect.fail({ _tag: "ClaudeTokenGenerateError" as const });
  }

  const match = stripAnsi(stdout).match(CLAUDE_TOKEN_PATTERN);
  if (!match) {
    return yield* Effect.fail({ _tag: "ClaudeTokenGenerateError" as const });
  }

  return match[1];
}).pipe(
  Effect.scoped,
  Effect.catchTag("PlatformError", () =>
    Effect.fail({ _tag: "ClaudeTokenGenerateError" as const }),
  ),
  Effect.timeout(CLAUDE_SETUP_TOKEN_TIMEOUT_MS),
  Effect.catchTag("TimeoutError", () => Effect.fail({ _tag: "ClaudeTokenGenerateError" as const })),
);

export const setGhSecret = (name: string, value: string) =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make("gh", ["secret", "set", name], {
      stdin: Stream.make(encoder.encode(value)),
      stdout: "ignore",
      stderr: "pipe",
    });

    const [exitCode, stderrOutput] = yield* Effect.all(
      [handle.exitCode, Stream.mkString(Stream.decodeText(handle.stderr))],
      { concurrency: 2 },
    );

    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      const reason = stderrOutput.trim() || `gh secret set exited with code ${exitCode}`;
      return yield* Effect.fail({ _tag: "GhSecretSetError" as const, reason });
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (platformError) =>
      Effect.fail({ _tag: "GhSecretSetError" as const, reason: platformError.message }),
    ),
    Effect.timeout(GH_SECRET_SET_TIMEOUT_MS),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail({ _tag: "GhSecretSetError" as const, reason: "gh secret set timed out" }),
    ),
  );

export const setGhVariable = (name: string, value: string) =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make("gh", ["variable", "set", name, "--body", value], {
      stdout: "ignore",
      stderr: "pipe",
    });

    const [exitCode, stderrOutput] = yield* Effect.all(
      [handle.exitCode, Stream.mkString(Stream.decodeText(handle.stderr))],
      { concurrency: 2 },
    );

    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      const reason = stderrOutput.trim() || `gh variable set exited with code ${exitCode}`;
      return yield* Effect.fail({ _tag: "GhVariableSetError" as const, reason });
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (platformError) =>
      Effect.fail({ _tag: "GhVariableSetError" as const, reason: platformError.message }),
    ),
    Effect.timeout(GH_SECRET_SET_TIMEOUT_MS),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail({ _tag: "GhVariableSetError" as const, reason: "gh variable set timed out" }),
    ),
  );
