import { describe, expect, it } from "vitest";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { executeBrowserFlow } from "../src/execute-browser-flow.js";
import type { BrowserFlowPlan, BrowserRunEvent, TestTarget } from "../src/types.js";

const createExecutionModel = (
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
    const parts: LanguageModelV3StreamPart[] = [
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
    ];

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
  it("streams structured events from model output and browser tool usage", async () => {
    let promptText = "";
    const events: BrowserRunEvent[] = [];
    const videoOutputPath = "/tmp/browser-tester-run-test/browser-flow.webm";

    for await (const event of executeBrowserFlow({
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
    })) {
      events.push(event);
    }

    expect(promptText).toContain("STEP_START|<step-id>|<step-title>");
    expect(promptText).toContain("Go through onboarding and click Import Projects.");
    expect(promptText).toContain("call the close tool exactly once");
    expect(promptText).toContain(videoOutputPath);
    expect(events.some((event) => event.type === "step-started")).toBe(true);
    expect(events.some((event) => event.type === "browser-log")).toBe(true);
    expect(events.some((event) => event.type === "tool-result")).toBe(true);
    expect(events.find((event) => event.type === "run-completed")).toMatchObject({
      type: "run-completed",
      status: "passed",
      videoPath: videoOutputPath,
    });
  });
});
