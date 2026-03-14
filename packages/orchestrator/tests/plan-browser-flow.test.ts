import { describe, expect, it } from "vitest";
import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { planBrowserFlow } from "../src/plan-browser-flow.js";
import type { TestTarget } from "../src/types.js";

const createPlannerModel = (
  callback: (options: LanguageModelV3CallOptions) => void,
): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: "test",
  modelId: "planner",
  supportedUrls: {},
  async doGenerate(options) {
    callback(options);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Onboarding import regression plan",
            rationale: "The changes affect onboarding and project import behavior.",
            targetSummary: "Exercise the onboarding import flow.",
            assumptions: ["The user can access onboarding."],
            riskAreas: ["Project import", "Onboarding progression"],
            targetUrls: ["/onboarding"],
            cookieSync: {
              required: true,
              reason: "The flow depends on an authenticated workspace session.",
            },
            steps: [
              {
                title: "Open onboarding",
                instruction: "Navigate to onboarding.",
                expectedOutcome: "The onboarding screen loads.",
                routeHint: "/onboarding",
                changedFileEvidence: ["src/onboarding.tsx"],
              },
            ],
          }),
        },
      ],
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
      warnings: [],
      request: { body: "" },
      response: {
        id: "response-id",
        timestamp: new Date(),
        modelId: "planner",
      },
    };
  },
  async doStream() {
    throw new Error("doStream not implemented for planner tests");
  },
});

const baseTarget: TestTarget = {
  scope: "branch",
  cwd: "/tmp/repo",
  branch: {
    current: "feature/onboarding",
    main: "main",
  },
  displayName: "branch feature/onboarding",
  diffStats: {
    additions: 12,
    deletions: 3,
    filesChanged: 4,
  },
  branchDiffStats: {
    additions: 12,
    deletions: 3,
    filesChanged: 4,
  },
  changedFiles: [
    { status: "M", path: "src/onboarding.tsx" },
    { status: "A", path: "src/import-projects.tsx" },
  ],
  recentCommits: [{ hash: "abc123", shortHash: "abc123", subject: "Improve onboarding flow" }],
  diffPreview: `src/onboarding.tsx | 4 ++--\n${"x".repeat(5000)}`,
};

describe("planBrowserFlow", () => {
  it("builds a scope-aware planning prompt and normalizes step ids", async () => {
    let promptText = "";

    const plan = await planBrowserFlow({
      target: baseTarget,
      userInstruction:
        "Go through onboarding at /onboarding and click Import Projects after selecting a workspace.",
      environment: {
        baseUrl: "http://localhost:3000",
        cookies: true,
        headed: true,
      },
      model: createPlannerModel((options) => {
        promptText =
          options.prompt[0].role === "user" && options.prompt[0].content[0].type === "text"
            ? options.prompt[0].content[0].text
            : "";
      }),
    });

    expect(promptText).toContain("Scope: branch");
    expect(promptText).toContain("Go through onboarding at /onboarding");
    expect(promptText).toContain("src/onboarding.tsx");
    expect(promptText).toContain("Base URL: http://localhost:3000");
    expect(promptText).toContain("...truncated...");
    expect(promptText).toContain("cookieSync.required");
    expect(plan.steps[0].id).toBe("step-01");
    expect(plan.userInstruction).toContain("Import Projects");
    expect(plan.cookieSync.required).toBe(true);
  });

  it("prioritizes product files over docs and artifacts in planner context", async () => {
    let promptText = "";

    const noisyTarget: TestTarget = {
      ...baseTarget,
      changedFiles: [
        { status: "M", path: ".agents/skills/agent-browser/SKILL.md" },
        { status: "A", path: ".browser-tester-logs/planning-failure.log" },
        { status: "A", path: ".tgz/task-assets.tgz" },
        { status: "A", path: "apps/frontend/components/task-card.tsx" },
        { status: "A", path: "apps/frontend/components/task-detail.tsx" },
        { status: "A", path: "apps/frontend/components/task-feed.tsx" },
        { status: "A", path: "apps/frontend/components/task-filter.tsx" },
        { status: "A", path: "apps/frontend/stores/task-store.ts" },
        { status: "M", path: "apps/frontend/app/page.tsx" },
        { status: "M", path: "apps/frontend/components/chat/chat-panel.tsx" },
        { status: "M", path: "apps/frontend/components/ui/card.tsx" },
        { status: "M", path: "apps/frontend/stores/layout-store.ts" },
        { status: "A", path: "apps/frontend/app/api/v1/tasks/route.ts" },
        { status: "A", path: "apps/frontend/app/api/v1/chats/route.ts" },
      ],
      diffPreview: [
        ".agents/skills/agent-browser/SKILL.md | 2 ++",
        "apps/frontend/components/task-card.tsx | 8 ++++++++",
        "2 files changed, 10 insertions(+)",
        "",
        "diff --git a/.agents/skills/agent-browser/SKILL.md b/.agents/skills/agent-browser/SKILL.md",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "",
        "diff --git a/apps/frontend/components/task-card.tsx b/apps/frontend/components/task-card.tsx",
        "@@ -0,0 +1,8 @@",
        "+export const TaskCard = () => null;",
      ].join("\n"),
    };

    await planBrowserFlow({
      target: noisyTarget,
      userInstruction: "Test the new task cards.",
      model: createPlannerModel((options) => {
        promptText =
          options.prompt[0].role === "user" && options.prompt[0].content[0].type === "text"
            ? options.prompt[0].content[0].text
            : "";
      }),
    });

    expect(promptText).toContain("apps/frontend/components/task-card.tsx");
    expect(promptText).toContain("apps/frontend/components/task-detail.tsx");
    expect(promptText).not.toContain("diff --git a/.agents/skills/agent-browser/SKILL.md");
    expect(promptText).not.toContain(".browser-tester-logs/planning-failure.log");
  });
});
