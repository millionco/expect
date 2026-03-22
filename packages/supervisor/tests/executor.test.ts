import { describe, it, expect } from "vite-plus/test";
import { Option } from "effect";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  TestReport,
  StepId,
  PlanId,
  ChangesFor,
  AgentText,
  AgentThinking,
  ToolCall,
  ToolResult,
  RunFinished,
  StepStarted,
  StepCompleted,
  StepFailed,
  type ExecutionEvent,
} from "@browser-tester/shared/models";

const makeStep = (id: string, title: string): TestPlanStep =>
  new TestPlanStep({
    id: StepId.makeUnsafe(id),
    title,
    instruction: `Do ${title}`,
    expectedOutcome: `${title} works`,
    routeHint: Option.none(),
    status: "pending",
    summary: Option.none(),
  });

const planFields = {
  changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
  currentBranch: "main",
  diffPreview: "",
  fileStats: [],
  instruction: "test",
  baseUrl: Option.none(),
  isHeadless: false,
  requiresCookies: false,
};

const makeTestPlan = (): TestPlan =>
  new TestPlan({
    ...planFields,
    id: PlanId.makeUnsafe("plan-01"),
    title: "Test plan",
    rationale: "Testing",
    steps: [makeStep("step-01", "CLI Application Startup")],
  } as any);

const makeTwoStepPlan = (): TestPlan =>
  new TestPlan({
    ...planFields,
    id: PlanId.makeUnsafe("plan-02"),
    title: "Two step plan",
    rationale: "Testing two steps",
    steps: [makeStep("step-01", "First Step"), makeStep("step-02", "Second Step")],
  } as any);

const sampleEvents: ExecutionEvent[] = [
  new AgentThinking({ text: "Let me analyze the code..." }),
  new AgentText({
    text: "I'll start by checking the CLI.\nSTEP_START|step-01|CLI Application Startup",
  }),
  new ToolCall({ toolName: "browser__open", input: { url: "http://localhost:3000" } }),
  new ToolResult({ toolName: "browser__open", result: "Browser opened", isError: false }),
  new ToolCall({ toolName: "browser__screenshot", input: { mode: "snapshot" } }),
  new ToolResult({
    toolName: "browser__screenshot",
    result: "/tmp/screenshot.png",
    isError: false,
  }),
  new AgentText({
    text: "The CLI started successfully.\nSTEP_DONE|step-01|CLI started and rendered correctly",
  }),
  new AgentText({ text: "RUN_COMPLETED|passed|All steps passed" }),
];

describe("reducer", () => {
  it("reduces ExecutionEvents into ExecutedTestPlan", () => {
    let executed = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    for (const event of sampleEvents) {
      executed = executed.addEvent(event);
    }

    expect(executed.events.length).toBeGreaterThan(0);

    const hasToolCalls = executed.events.some((event) => event._tag === "ToolCall");
    const hasToolResults = executed.events.some((event) => event._tag === "ToolResult");
    const hasThinking = executed.events.some((event) => event._tag === "AgentThinking");

    expect(hasToolCalls).toBe(true);
    expect(hasToolResults).toBe(true);
    expect(hasThinking).toBe(true);
  });

  it("parses markers from AgentText and applies step status", () => {
    let executed = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    executed = executed.addEvent(
      new AgentText({ text: "Starting step.\nSTEP_START|step-01|CLI Application Startup" }),
    );
    expect(executed.steps[0].status).toBe("active");

    executed = executed.addEvent(new AgentText({ text: "Done.\nSTEP_DONE|step-01|CLI started" }));
    expect(executed.steps[0].status).toBe("passed");
  });

  it("handles step failure markers", () => {
    let executed = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    executed = executed.addEvent(
      new AgentText({ text: "STEP_START|step-01|CLI Application Startup" }),
    );
    executed = executed.addEvent(
      new AgentText({ text: "ASSERTION_FAILED|step-01|Page did not load" }),
    );
    expect(executed.steps[0].status).toBe("failed");
  });

  it("each addEvent returns a new instance", () => {
    const initial = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    let previous = initial;
    for (const event of sampleEvents.slice(0, 4)) {
      const next = previous.addEvent(event);
      expect(next).not.toBe(previous);
      previous = next;
    }

    expect(previous.events.length).toBeGreaterThan(0);
  });

  it("exposes activeStep and completedStepCount getters", () => {
    let executed = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    expect(executed.activeStep).toBeUndefined();
    expect(executed.completedStepCount).toBe(0);

    executed = executed.addEvent(
      new AgentText({ text: "STEP_START|step-01|CLI Application Startup" }),
    );
    expect(executed.activeStep?.id).toBe("step-01");
    expect(executed.completedStepCount).toBe(0);

    executed = executed.addEvent(new AgentText({ text: "STEP_DONE|step-01|Done" }));
    expect(executed.activeStep).toBeUndefined();
    expect(executed.completedStepCount).toBe(1);
  });
});

describe("TestReport", () => {
  const makeReport = (events: ExecutionEvent[]): TestReport => {
    let executed = new ExecutedTestPlan({ ...makeTwoStepPlan(), events: [] });
    for (const event of events) {
      executed = executed.addEvent(event);
    }
    return new TestReport({
      ...executed,
      summary: "Test summary",
      screenshotPaths: [],
      pullRequest: Option.none(),
    });
  };

  it("status is passed when no steps failed", () => {
    const report = makeReport([
      new AgentText({ text: "STEP_START|step-01|First Step" }),
      new AgentText({ text: "STEP_DONE|step-01|Done" }),
      new AgentText({ text: "STEP_START|step-02|Second Step" }),
      new AgentText({ text: "STEP_DONE|step-02|Done" }),
    ]);
    expect(report.status).toBe("passed");
  });

  it("status is failed when any step failed", () => {
    const report = makeReport([
      new AgentText({ text: "STEP_START|step-01|First Step" }),
      new AgentText({ text: "STEP_DONE|step-01|Done" }),
      new AgentText({ text: "STEP_START|step-02|Second Step" }),
      new AgentText({ text: "ASSERTION_FAILED|step-02|Broken" }),
    ]);
    expect(report.status).toBe("failed");
  });

  it("status is passed when steps are still pending", () => {
    const report = makeReport([]);
    expect(report.status).toBe("passed");
  });

  it("toPlainText includes status and summary", () => {
    const report = makeReport([
      new AgentText({ text: "STEP_START|step-01|First Step" }),
      new AgentText({ text: "STEP_DONE|step-01|Looks good" }),
    ]);
    const text = report.toPlainText;
    expect(text).toContain("Status: passed");
    expect(text).toContain("Summary: Test summary");
  });

  it("toPlainText shows step statuses", () => {
    const report = makeReport([
      new AgentText({ text: "STEP_START|step-01|First Step" }),
      new AgentText({ text: "STEP_DONE|step-01|Looks good" }),
      new AgentText({ text: "STEP_START|step-02|Second Step" }),
      new AgentText({ text: "ASSERTION_FAILED|step-02|Page broken" }),
    ]);
    const text = report.toPlainText;
    expect(text).toContain("PASSED First Step: Looks good");
    expect(text).toContain("FAILED Second Step: Page broken");
  });

  it("toPlainText shows NOT-RUN for pending steps", () => {
    const report = makeReport([]);
    const text = report.toPlainText;
    expect(text).toContain("NOT-RUN First Step:");
    expect(text).toContain("NOT-RUN Second Step:");
  });
});

describe("ToolCall.displayText", () => {
  it("returns command string for exec-like inputs", () => {
    const toolCall = new ToolCall({ toolName: "exec", input: { command: "npm test" } });
    expect(toolCall.displayText).toBe("npm test");
  });

  it("truncates long commands", () => {
    const longCommand = "a".repeat(200);
    const toolCall = new ToolCall({ toolName: "exec", input: { command: longCommand } });
    expect(toolCall.displayText.length).toBe(80);
  });

  it("returns toolName when input has no command", () => {
    const toolCall = new ToolCall({ toolName: "browser__screenshot", input: { mode: "snapshot" } });
    expect(toolCall.displayText).toBe("browser__screenshot");
  });

  it("returns toolName for non-object input", () => {
    const toolCall = new ToolCall({ toolName: "browser__open", input: "http://localhost" });
    expect(toolCall.displayText).toBe("browser__open");
  });
});
