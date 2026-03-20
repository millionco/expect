import { describe, expect, it } from "vite-plus/test";
import { BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME } from "@browser-tester/browser/mcp";
import { buildBrowserMcpServerEnv, buildBrowserMcpSettings } from "../src/browser-mcp-config";

describe("buildBrowserMcpServerEnv", () => {
  it("returns undefined when no server defaults are needed", () => {
    expect(buildBrowserMcpServerEnv({})).toBeUndefined();
  });

  it("includes replay output when configured", () => {
    expect(
      buildBrowserMcpServerEnv({
        replayOutputPath: "/tmp/browser-flow.ndjson",
      }),
    ).toEqual({
      [BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME]: "/tmp/browser-flow.ndjson",
    });
  });

  it("keeps only the configured browser MCP server", () => {
    const settings = buildBrowserMcpSettings({
      browserMcpServerName: "browser",
      providerSettings: {
        mcpServers: {
          browser: {
            command: "custom-browser",
            args: ["--flag"],
            env: { EXISTING_BROWSER_ENV: "1" },
          },
          slack: {
            command: "slack-mcp",
          },
        },
      },
      replayOutputPath: "/tmp/browser-flow.ndjson",
    });

    expect(settings.mcpServers).toEqual({
      browser: {
        type: "stdio",
        command: process.execPath,
        args: expect.any(Array),
        env: {
          EXISTING_BROWSER_ENV: "1",
          [BROWSER_TESTER_REPLAY_OUTPUT_ENV_NAME]: "/tmp/browser-flow.ndjson",
        },
      },
    });
  });
});
