import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vite-plus/test";

const CLI_BIN = path.resolve(__dirname, "../dist/index.js");
const DAEMON_BIN = path.resolve(__dirname, "../dist/browser-daemon.js");

const TOOL_COMMANDS = [
  "open",
  "playwright",
  "screenshot",
  "console_logs",
  "network_requests",
  "performance_metrics",
  "accessibility_audit",
  "close",
] as const;

const runHelp = (args: string[] = ["--help"]): string =>
  execFileSync(process.execPath, [CLI_BIN, ...args], {
    encoding: "utf8",
    timeout: 10_000,
  });

describe("browser CLI commands", () => {
  it("browser-daemon.js exists in dist", () => {
    expect(fs.existsSync(DAEMON_BIN)).toBe(true);
  });

  it("all 8 tool commands appear in --help output", () => {
    const helpOutput = runHelp();
    for (const command of TOOL_COMMANDS) {
      expect(helpOutput).toContain(command);
    }
  });

  it("open command shows its options in --help", () => {
    const helpOutput = runHelp(["open", "--help"]);
    expect(helpOutput).toContain("--headed");
    expect(helpOutput).toContain("--cookies");
    expect(helpOutput).toContain("--cdp");
    expect(helpOutput).toContain("--browser");
    expect(helpOutput).toContain("--wait-until");
  });

  it("playwright command shows its options in --help", () => {
    const helpOutput = runHelp(["playwright", "--help"]);
    expect(helpOutput).toContain("--snapshot-after");
    expect(helpOutput).toContain("--description");
  });

  it("screenshot command shows its options in --help", () => {
    const helpOutput = runHelp(["screenshot", "--help"]);
    expect(helpOutput).toContain("--mode");
    expect(helpOutput).toContain("--full-page");
  });

  it("console_logs command shows its options in --help", () => {
    const helpOutput = runHelp(["console_logs", "--help"]);
    expect(helpOutput).toContain("--type");
    expect(helpOutput).toContain("--clear");
  });

  it("network_requests command shows its options in --help", () => {
    const helpOutput = runHelp(["network_requests", "--help"]);
    expect(helpOutput).toContain("--method");
    expect(helpOutput).toContain("--url");
    expect(helpOutput).toContain("--resource-type");
    expect(helpOutput).toContain("--clear");
  });

  it("accessibility_audit command shows its options in --help", () => {
    const helpOutput = runHelp(["accessibility_audit", "--help"]);
    expect(helpOutput).toContain("--selector");
    expect(helpOutput).toContain("--tags");
  });

  it("close command has no required arguments", () => {
    const helpOutput = runHelp(["close", "--help"]);
    expect(helpOutput).toContain("close the browser");
    expect(helpOutput).not.toContain("<");
  });
});
