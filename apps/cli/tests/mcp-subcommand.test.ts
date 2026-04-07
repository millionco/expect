import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";

const CLI_BIN = path.resolve(__dirname, "../dist/index.js");
const MCP_BIN = path.resolve(__dirname, "../dist/browser-mcp.js");

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
});
