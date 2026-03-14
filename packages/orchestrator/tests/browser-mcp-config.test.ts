import { describe, expect, it } from "vitest";
import {
  BROWSER_TESTER_VIDEO_OUTPUT_ENV_NAME,
  buildBrowserMcpServerEnv,
} from "../src/browser-mcp-config.js";

describe("buildBrowserMcpServerEnv", () => {
  it("returns undefined when no server defaults are needed", () => {
    expect(buildBrowserMcpServerEnv({})).toBeUndefined();
  });

  it("includes video output when configured", () => {
    expect(
      buildBrowserMcpServerEnv({
        videoOutputPath: "/tmp/browser-flow.webm",
      }),
    ).toEqual({
      [BROWSER_TESTER_VIDEO_OUTPUT_ENV_NAME]: "/tmp/browser-flow.webm",
    });
  });
});
