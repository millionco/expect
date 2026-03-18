import { existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { buildExecutionModelSettings, executeBrowserFlow } from "../src/execute-browser-flow";
import type { BrowserFlowPlan, TestTarget } from "../src/types";

const createStreamModel = (
  parts: LanguageModelV3StreamPart[],
  callback: (options: LanguageModelV3CallOptions) => void,
): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: "test",
  modelId: "executor",
  supportedUrls: {},
  async doGenerate() {
    throw new Error("doGenerate not implemented for execution tests");
  },
  async doStream(options) {
    callback(options);
    return {
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          for (const part of parts) controller.enqueue(part);
          controller.close();
        },
      }),
      request: {
        body: "",
      },
    };
  },
});

const createExecutionModel = (
  callback: (options: LanguageModelV3CallOptions) => void,
): LanguageModelV3 =>
  createStreamModel(
    [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      {
        type: "text-delta",
        id: "t1",
        delta: "STEP_START|step-01|Open onboarding\nThe page loaded.\n",
      },
      { type: "text-end", id: "t1" },
      {
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "mcp__browser__open",
        input: '{"url":"http://localhost:3000/onboarding"}',
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: "tool-1",
        toolName: "mcp__browser__open",
        result: "Opened http://localhost:3000/onboarding",
        isError: false,
      },
      { type: "text-start", id: "t2" },
      {
        type: "text-delta",
        id: "t2",
        delta:
          "STEP_DONE|step-01|Opened onboarding successfully\nRUN_COMPLETED|passed|Verified onboarding import path\n",
      },
      { type: "text-end", id: "t2" },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
        providerMetadata: {
          "browser-tester-agent": {
            sessionId: "session-123",
          },
        },
      },
    ],
    callback,
  );

const testTarget: TestTarget = {
  scope: "unstaged",
  cwd: "/tmp/repo",
  branch: {
    current: "feature/onboarding",
    main: "main",
  },
  displayName: "unstaged changes on feature/onboarding",
  diffStats: {
    additions: 8,
    deletions: 1,
    filesChanged: 2,
  },
  branchDiffStats: null,
  changedFiles: [{ status: "M", path: "src/onboarding.tsx" }],
  recentCommits: [],
  diffPreview: "src/onboarding.tsx | 9 ++++++++-",
};

const testPlan: BrowserFlowPlan = {
  title: "Onboarding import regression plan",
  rationale: "Verify onboarding import still works after the changes.",
  targetSummary: "Cover onboarding and import entry points.",
  userInstruction: "Go through onboarding and click Import Projects.",
  assumptions: [],
  riskAreas: ["Onboarding", "Project import"],
  targetUrls: ["/onboarding"],
  cookieSync: {
    required: false,
    reason: "This test can run without an existing signed-in session.",
  },
  steps: [
    {
      id: "step-01",
      title: "Open onboarding",
      instruction: "Navigate to onboarding.",
      expectedOutcome: "The onboarding page loads.",
      routeHint: "/onboarding",
      changedFileEvidence: ["src/onboarding.tsx"],
    },
  ],
};

describe("executeBrowserFlow", () => {
  it("limits execution to browser tools and medium effort", () => {
    const settings = buildExecutionModelSettings({
      target: testTarget,
      browserMcpServerName: "browser",
      provider: "claude",
      providerSettings: {
        tools: ["Bash"],
        effort: "high",
        mcpServers: {
          browser: {
            command: "custom-browser",
            env: { EXISTING_BROWSER_ENV: "1" },
          },
          slack: {
            command: "slack-mcp",
          },
        },
      },
      videoOutputPath: "/tmp/browser-tester-run-test/browser-flow.webm",
    });

    expect(settings.effort).toBe("medium");
    expect(settings.tools).toContain("mcp__browser__open");
    expect(settings.tools).toContain("mcp__browser__playwright");
    expect(settings.tools).toContain("mcp__browser__screenshot");
    expect(settings.tools).toContain("mcp__browser__close");
    expect(settings.tools).not.toContain("Bash");
    expect(settings.tools).toHaveLength(4);
    expect(settings.tools?.every((toolName) => toolName.startsWith("mcp__browser__"))).toBe(true);
    expect(settings.mcpServers).toEqual({
      browser: {
        type: "stdio",
        command: process.execPath,
        args: expect.any(Array),
        env: {
          EXISTING_BROWSER_ENV: "1",
          BROWSER_TESTER_VIDEO_OUTPUT_PATH: "/tmp/browser-tester-run-test/browser-flow.webm",
        },
      },
    });
  });

  it("streams structured events from model output and browser tool usage", async () => {
    let promptText = "";
    const videoOutputPath = "/tmp/browser-tester-run-test/browser-flow.webm";

    const events = await Effect.runPromise(
      Stream.runCollect(
        executeBrowserFlow({
          target: testTarget,
          plan: testPlan,
          environment: {
            baseUrl: "http://localhost:3000",
            cookies: true,
          },
          videoOutputPath,
          model: createExecutionModel((options) => {
            promptText =
              options.prompt[0].role === "user" && options.prompt[0].content[0].type === "text"
                ? options.prompt[0].content[0].text
                : "";
          }),
        }),
      ),
    );

    expect(promptText).toContain("STEP_START|<step-id>|<step-title>");
    expect(promptText).toContain("Go through onboarding and click Import Projects.");
    expect(promptText).toContain("call the close tool exactly once");
    expect(promptText).toContain("Execution style: assertion-first");
    expect(promptText).toContain("Allowed failure categories: app-bug");
    expect(promptText).toContain(videoOutputPath);
    expect(events.some((event) => event.type === "step-started")).toBe(true);
    expect(events.some((event) => event.type === "browser-log")).toBe(true);
    expect(events.some((event) => event.type === "tool-result")).toBe(true);
    const analyzingResultsIndex = events.findIndex(
      (event) => event.type === "text" && event.text === "Analyzing results",
    );
    const buildingReportIndex = events.findIndex(
      (event) => event.type === "text" && event.text === "Building report",
    );
    const completionEventIndex = events.findIndex((event) => event.type === "run-completed");

    expect(analyzingResultsIndex).toBeGreaterThan(-1);
    expect(buildingReportIndex).toBeGreaterThan(analyzingResultsIndex);
    expect(completionEventIndex).toBeGreaterThan(buildingReportIndex);
    expect(events.find((event) => event.type === "run-completed")).toMatchObject({
      type: "run-completed",
      status: "passed",
      videoPath: videoOutputPath,
      report: {
        status: "passed",
        summary: "Verified onboarding import path",
        stepResults: [
          {
            stepId: "step-01",
            status: "passed",
          },
        ],
      },
    });
  });

  it("stores browser screenshots in /tmp and emits the saved path", async () => {
    const screenshotBase64 = Buffer.from("fake screenshot").toString("base64");
    const screenshotResult = JSON.stringify({
      content: [
        {
          type: "image",
          data: screenshotBase64,
          mimeType: "image/png",
        },
      ],
    });
    const events = await Effect.runPromise(
      Stream.runCollect(
        executeBrowserFlow({
          target: testTarget,
          plan: testPlan,
          model: createStreamModel(
            [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              {
                type: "text-delta",
                id: "t1",
                delta: "STEP_START|step-01|Open onboarding\n",
              },
              { type: "text-end", id: "t1" },
              {
                type: "tool-call",
                toolCallId: "tool-1",
                toolName: "mcp__browser__screenshot",
                input: '{"fullPage":true}',
                providerExecuted: true,
              },
              {
                type: "tool-result",
                toolCallId: "tool-1",
                toolName: "mcp__browser__screenshot",
                result: screenshotResult,
                isError: false,
              },
              { type: "text-start", id: "t2" },
              {
                type: "text-delta",
                id: "t2",
                delta:
                  "STEP_DONE|step-01|Captured the UI\nRUN_COMPLETED|passed|Verified screenshot output\n",
              },
              { type: "text-end", id: "t2" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: {
                    total: undefined,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
                },
                providerMetadata: {},
              },
            ],
            () => {},
          ),
        }),
      ),
    );

    const screenshotToolResultEvent = events.find(
      (event) =>
        event.type === "tool-result" &&
        event.toolName === "mcp__browser__screenshot" &&
        !event.isError,
    );

    expect(screenshotToolResultEvent).toBeDefined();

    if (!screenshotToolResultEvent || screenshotToolResultEvent.type !== "tool-result") {
      throw new Error("Expected screenshot tool result event");
    }

    expect(screenshotToolResultEvent.result.startsWith("Screenshot saved to /tmp/")).toBe(true);

    const screenshotPath = screenshotToolResultEvent.result.replace("Screenshot saved to ", "");

    expect(existsSync(screenshotPath)).toBe(true);
    expect(events.find((event) => event.type === "run-completed")).toMatchObject({
      type: "run-completed",
      report: {
        artifacts: {
          screenshotPaths: [screenshotPath],
        },
      },
    });

    rmSync(dirname(screenshotPath), { recursive: true, force: true });
  });

  it("serializes object tool results instead of object Object", async () => {
    const events = await Effect.runPromise(
      Stream.runCollect(
        executeBrowserFlow({
          target: testTarget,
          plan: testPlan,
          model: createStreamModel(
            [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              {
                type: "text-delta",
                id: "t1",
                delta: "STEP_START|step-01|Open onboarding\n",
              },
              { type: "text-end", id: "t1" },
              {
                type: "tool-call",
                toolCallId: "tool-1",
                toolName: "mcp__browser__open",
                input: '{"url":"http://localhost:3000/onboarding"}',
                providerExecuted: true,
              },
              {
                type: "tool-result",
                toolCallId: "tool-1",
                toolName: "mcp__browser__open",
                result: {
                  ok: true,
                  url: "http://localhost:3000/onboarding",
                },
                isError: false,
              },
              { type: "text-start", id: "t2" },
              {
                type: "text-delta",
                id: "t2",
                delta:
                  "STEP_DONE|step-01|Opened onboarding successfully\nRUN_COMPLETED|passed|Verified object tool result serialization\n",
              },
              { type: "text-end", id: "t2" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: {
                    total: undefined,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
                },
                providerMetadata: {},
              },
            ],
            () => {},
          ),
        }),
      ),
    );

    expect(
      events.find(
        (event) =>
          event.type === "tool-result" && event.toolName === "mcp__browser__open" && !event.isError,
      ),
    ).toMatchObject({
      type: "tool-result",
      result: '{"ok":true,"url":"http://localhost:3000/onboarding"}',
    });
  });
});
