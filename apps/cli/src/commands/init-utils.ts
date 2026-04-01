import { spawn, spawnSync } from "node:child_process";
import { Effect, Schema, Stream } from "effect";
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

export class ClaudeTokenGenerateError extends Schema.ErrorClass<ClaudeTokenGenerateError>(
  "ClaudeTokenGenerateError",
)({
  _tag: Schema.tag("ClaudeTokenGenerateError"),
}) {
  message = "Failed to generate Claude API token";
}

export class GhSecretSetError extends Schema.ErrorClass<GhSecretSetError>("GhSecretSetError")({
  _tag: Schema.tag("GhSecretSetError"),
  reason: Schema.String,
}) {
  message = `Failed to set GitHub secret: ${this.reason}`;
}

export class GhVariableSetError extends Schema.ErrorClass<GhVariableSetError>("GhVariableSetError")(
  {
    _tag: Schema.tag("GhVariableSetError"),
    reason: Schema.String,
  },
) {
  message = `Failed to set GitHub variable: ${this.reason}`;
}

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
    return yield* new ClaudeTokenGenerateError();
  }

  const match = stripAnsi(stdout).match(CLAUDE_TOKEN_PATTERN);
  if (!match) {
    return yield* new ClaudeTokenGenerateError();
  }

  return match[1];
}).pipe(
  Effect.scoped,
  Effect.catchTag("PlatformError", () => new ClaudeTokenGenerateError().asEffect()),
  Effect.timeout(CLAUDE_SETUP_TOKEN_TIMEOUT_MS),
  Effect.catchTag("TimeoutError", () => new ClaudeTokenGenerateError().asEffect()),
);

export const setGhSecret = (name: string, value: string) =>
  Effect.gen(function* () {
    const encoder = new TextEncoder();
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
      return yield* new GhSecretSetError({ reason });
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (platformError) =>
      new GhSecretSetError({ reason: platformError.message }).asEffect(),
    ),
    Effect.timeout(GH_SECRET_SET_TIMEOUT_MS),
    Effect.catchTag("TimeoutError", () =>
      new GhSecretSetError({ reason: "gh secret set timed out" }).asEffect(),
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
      return yield* new GhVariableSetError({ reason });
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (platformError) =>
      new GhVariableSetError({ reason: platformError.message }).asEffect(),
    ),
    Effect.timeout(GH_SECRET_SET_TIMEOUT_MS),
    Effect.catchTag("TimeoutError", () =>
      new GhVariableSetError({ reason: "gh variable set timed out" }).asEffect(),
    ),
  );
