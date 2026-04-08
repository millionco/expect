import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { CLI_SESSION_FILE, TMP_ARTIFACT_OUTPUT_DIRECTORY } from "@expect/browser/mcp";

const DAEMON_POLL_INTERVAL_MS = 100;
const DAEMON_STARTUP_TIMEOUT_MS = 15_000;

interface SessionInfo {
  readonly pid: number;
  readonly port: number;
}

interface ToolResultContent {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

export interface ToolResult {
  readonly content: readonly ToolResultContent[];
}

const isSessionInfo = (value: unknown): value is SessionInfo =>
  typeof value === "object" &&
  value !== null &&
  "pid" in value &&
  "port" in value &&
  typeof value.pid === "number" &&
  typeof value.port === "number";

const readSession = (): SessionInfo | undefined => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(CLI_SESSION_FILE, "utf-8"));
    return isSessionInfo(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const isDaemonRunning = (): boolean => {
  const session = readSession();
  return Boolean(session && isProcessAlive(session.pid));
};

const waitForSessionFile = (): Promise<SessionInfo> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + DAEMON_STARTUP_TIMEOUT_MS;
    const poll = () => {
      const session = readSession();
      if (session && isProcessAlive(session.pid)) {
        resolve(session);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("Daemon failed to start within timeout"));
        return;
      }
      setTimeout(poll, DAEMON_POLL_INTERVAL_MS);
    };
    poll();
  });

export const ensureDaemon = async (): Promise<SessionInfo> => {
  const existing = readSession();
  if (existing && isProcessAlive(existing.pid)) return existing;

  const daemonBin = path.join(path.dirname(new URL(import.meta.url).pathname), "browser-daemon.js");
  const child = childProcess.spawn(process.execPath, [daemonBin], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  return waitForSessionFile();
};

export const stripUndefined = (args: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
};

export const callTool = async (
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> => {
  const session = await ensureDaemon();
  const response = await fetch(`http://localhost:${session.port}/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripUndefined(args)),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Tool ${toolName} failed (${response.status}): ${errorBody}`);
  }
  return response.json();
};

export const killDaemon = (): boolean => {
  const session = readSession();
  if (!session) return false;
  try {
    process.kill(session.pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
};

export const printToolResult = (result: ToolResult) => {
  for (const block of result.content) {
    if (block.type === "text" && block.text) {
      process.stdout.write(block.text + "\n");
    }
    if (block.type === "image" && block.data) {
      const outputPath = path.join(TMP_ARTIFACT_OUTPUT_DIRECTORY, `screenshot-${Date.now()}.png`);
      fs.mkdirSync(TMP_ARTIFACT_OUTPUT_DIRECTORY, { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(block.data, "base64"));
      process.stdout.write(`Screenshot saved: ${outputPath}\n`);
    }
  }
};
