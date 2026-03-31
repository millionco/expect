import { spawn, spawnSync } from "node:child_process";
import { Effect } from "effect";
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

export const isGhAuthenticated = Effect.try({
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

export const generateClaudeToken = Effect.tryPromise({
  try: () =>
    new Promise<string>((resolve, reject) => {
      const child = spawn("claude", ["setup-token"], {
        stdio: ["inherit", "pipe", "inherit"],
      });
      let stdout = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("claude setup-token timed out"));
      }, CLAUDE_SETUP_TOKEN_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`claude setup-token exited with code ${code}`));
          return;
        }
        const match = stripAnsi(stdout).match(CLAUDE_TOKEN_PATTERN);
        if (match) {
          resolve(match[1]);
        } else {
          reject(new Error("Could not extract token from output"));
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    }),
  catch: () => ({ _tag: "ClaudeTokenGenerateError" as const }),
});

export const setGhSecret = (name: string, value: string) =>
  Effect.try({
    try: () => {
      const result = spawnSync("gh", ["secret", "set", name], {
        input: value,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: GH_SECRET_SET_TIMEOUT_MS,
      });
      if (result.status !== 0) {
        const stderr = result.stderr ? result.stderr.toString().trim() : "";
        throw new Error(stderr || `gh secret set exited with code ${result.status}`);
      }
    },
    catch: (error) => ({
      _tag: "GhSecretSetError" as const,
      reason: error instanceof Error ? error.message : String(error),
    }),
  });

export const setGhVariable = (name: string, value: string) =>
  Effect.try({
    try: () => {
      const result = spawnSync("gh", ["variable", "set", name, "--body", value], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: GH_SECRET_SET_TIMEOUT_MS,
      });
      if (result.status !== 0) {
        const stderr = result.stderr ? result.stderr.toString().trim() : "";
        throw new Error(stderr || `gh variable set exited with code ${result.status}`);
      }
    },
    catch: (error) => ({
      _tag: "GhVariableSetError" as const,
      reason: error instanceof Error ? error.message : String(error),
    }),
  });
