import { describe, expect, it } from "vite-plus/test";
import type { TestTarget } from "@browser-tester/supervisor";
import { createDirectRunPlan } from "@browser-tester/supervisor";

const target: TestTarget = {
  scope: "changes",
  cwd: "/repo",
  branch: {
    current: "feature/direct-run",
    main: "main",
  },
  displayName: "feature/direct-run",
  diffStats: null,
  branchDiffStats: null,
  changedFiles: [
    { path: "apps/web/src/app.tsx", status: "M" },
    { path: "apps/web/src/routes/login.tsx", status: "M" },
  ],
  recentCommits: [],
  diffPreview: "",
};

describe("createDirectRunPlan", () => {
  it("builds a valid single-step execution plan", () => {
    const plan = createDirectRunPlan({
      userInstruction: "Test the login flow and verify form errors still render correctly.",
      target,
    });

    expect(plan.title).toContain("Direct run:");
    expect(plan.userInstruction).toContain("Test the login flow");
    expect(plan.cookieSync.required).toBe(true);
    expect(plan.riskAreas).toEqual(["apps/web/src/app.tsx", "apps/web/src/routes/login.tsx"]);
    expect(plan.steps).toEqual([
      {
        id: "step-1",
        title: "Run requested browser test",
        instruction:
          "Use the browser to carry out this instruction: Test the login flow and verify form errors still render correctly.",
        expectedOutcome:
          "The requested browser flow works as described, or any blocker is captured with evidence.",
        changedFileEvidence: ["apps/web/src/app.tsx", "apps/web/src/routes/login.tsx"],
      },
    ]);
  });
});
