import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";

const CLI_BIN = path.resolve(__dirname, "../dist/index.js");
const MCP_BIN = path.resolve(__dirname, "../dist/browser-mcp.js");
const MCP_PROCESS_EXIT_TIMEOUT_MS = 3_000;

const waitForExit = (child: ReturnType<typeof spawn>, timeoutMs = MCP_PROCESS_EXIT_TIMEOUT_MS) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

describe("mcp subcommand", () => {
  it("browser-mcp.js exists in dist", () => {
    expect(fs.existsSync(MCP_BIN)).toBe(true);
  });

  it("mcp appears in --help output", () => {
    const result = execFileSync(process.execPath, [CLI_BIN, "--help"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result).toContain("mcp");
    expect(result).toContain("standalone MCP server");
  });

  it("mcp subcommand starts without crashing", async () => {
    const child = spawn(process.execPath, [CLI_BIN, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(child.exitCode).toBeNull();
    expect(stderr).not.toContain("Cannot find module");
    expect(stderr).not.toContain("MODULE_NOT_FOUND");

    child.kill();
    await new Promise<void>((resolve) => child.on("exit", resolve));
  });

  it("direct browser-mcp.js starts without crashing", async () => {
    const child = spawn(process.execPath, [MCP_BIN], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(child.exitCode).toBeNull();
    expect(stderr).not.toContain("Cannot find module");
    expect(stderr).not.toContain("Error");

    child.kill();
    await new Promise<void>((resolve) => child.on("exit", resolve));
  });

  it("direct browser-mcp.js exits when stdin closes", async () => {
    const child = spawn(process.execPath, [MCP_BIN], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(child.exitCode).toBeNull();
    child.stdin?.end();

    const result = await waitForExit(child);
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(stderr).not.toContain("cleanup failed");
  });
});
