import { describe, expect, it } from "vite-plus/test";
import { Option } from "effect";
import {
  AcpAgentMessageChunk,
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
  StepStarted,
  StepCompleted,
  StepFailed,
  StepSkipped,
  RunStarted,
  AgentText,
  RunFinished,
} from "../src/models";

const makeEmptyPlan = (): TestPlan =>
  new TestPlan({
    id: PlanId.makeUnsafe("plan-01"),
    title: "Direct execution",
    rationale: "Direct execution",
    steps: [],
    changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
    currentBranch: "main",
    diffPreview: "",
    fileStats: [],
    instruction: "test",
    baseUrl: Option.none(),
    isHeadless: false,
    cookieBrowserKeys: [],
    testCoverage: Option.none(),
  });

const makeEmptyExecuted = (): ExecutedTestPlan =>
  new ExecutedTestPlan({
    ...makeEmptyPlan(),
    events: [new RunStarted({ plan: makeEmptyPlan() })],
  });

describe("dynamic step discovery", () => {
  it("creates a new step when StepStarted arrives for an unknown step ID", () => {
    const executed = makeEmptyExecuted();
    expect(executed.steps.length).toBe(0);

    const result = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Navigate to login" }),
    );

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].id).toBe("step-01");
    expect(result.steps[0].title).toBe("Navigate to login");
    expect(result.steps[0].status).toBe("active");
    expect(Option.isSome(result.steps[0].startedAt)).toBe(true);
  });

  it("creates multiple steps sequentially", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Open page" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "Page opened" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-02"), title: "Fill form" }),
    );

    expect(executed.steps.length).toBe(2);
    expect(executed.steps[0].status).toBe("passed");
    expect(executed.steps[1].status).toBe("active");
  });

  it("marks a dynamically created step as failed", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Login" }),
    );
    executed = executed.applyMarker(
      new StepFailed({ stepId: StepId.makeUnsafe("step-01"), message: "Login button not found" }),
    );

    expect(executed.steps.length).toBe(1);
    expect(executed.steps[0].status).toBe("failed");
    expect(Option.getOrElse(executed.steps[0].summary, () => "")).toBe("Login button not found");
  });

  it("updates an existing step when StepStarted arrives for a known step ID", () => {
    const planWithStep = new TestPlan({
      ...makeEmptyPlan(),
      steps: [
        new TestPlanStep({
          id: StepId.makeUnsafe("step-01"),
          title: "Predefined step",
          instruction: "Do something",
          expectedOutcome: "Something happens",
          routeHint: Option.none(),
          status: "pending",
          summary: Option.none(),
          startedAt: Option.none(),
          endedAt: Option.none(),
        }),
      ],
    });

    let executed = new ExecutedTestPlan({
      ...planWithStep,
      events: [new RunStarted({ plan: planWithStep })],
    });

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Updated title" }),
    );

    expect(executed.steps.length).toBe(1);
    expect(executed.steps[0].status).toBe("active");
    expect(executed.steps[0].title).toBe("Updated title");
  });

  it("activeStep returns the currently active step", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "Done" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-02"), title: "Second" }),
    );

    expect(executed.activeStep?.id).toBe("step-02");
    expect(executed.activeStep?.title).toBe("Second");
  });

  it("completedStepCount tracks passed and failed steps", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "OK" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-02"), title: "Second" }),
    );
    executed = executed.applyMarker(
      new StepFailed({ stepId: StepId.makeUnsafe("step-02"), message: "Broke" }),
    );

    expect(executed.completedStepCount).toBe(2);
  });

  it("finalizeTextBlock parses markers from trailing AgentText", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Navigate" }),
    );

    const withText = new ExecutedTestPlan({
      ...executed,
      events: [
        ...executed.events,
        new AgentText({
          text: "STEP_DONE|step-01|Page loaded successfully\nRUN_COMPLETED|passed|All steps passed",
        }),
      ],
    });

    expect(withText.completedStepCount).toBe(0);

    const finalized = withText.finalizeTextBlock();

    expect(finalized.completedStepCount).toBe(1);
    expect(finalized.steps[0].status).toBe("passed");
    expect(Option.getOrElse(finalized.steps[0].summary, () => "")).toBe("Page loaded successfully");

    const runFinished = finalized.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished).toBeDefined();
    expect(runFinished!.status).toBe("passed");
    expect(runFinished!.summary).toBe("All steps passed");
  });

  it("finalizeTextBlock preserves a rich session summary with pipes and semicolons", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Login flow" }),
    );

    const richSummary =
      "Verified login flow and dashboard rendering. Found a bug: submit button clipped at 375px viewport (likely-scope=src/components/LoginForm.tsx). Auth requires redirect to /callback after OAuth; future runs should seed 3+ users before testing list views. No unresolved risks.";

    const withText = new ExecutedTestPlan({
      ...executed,
      events: [
        ...executed.events,
        new AgentText({
          text: `STEP_DONE|step-01|Login form submitted\nRUN_COMPLETED|passed|${richSummary}`,
        }),
      ],
    });

    const finalized = withText.finalizeTextBlock();

    const runFinished = finalized.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished).toBeDefined();
    expect(runFinished!.summary).toBe(richSummary);
  });

  it("finalizeTextBlock parses ASSERTION_FAILED from trailing AgentText", () => {
    let executed = makeEmptyExecuted();

    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Login" }),
    );

    const withText = new ExecutedTestPlan({
      ...executed,
      events: [
        ...executed.events,
        new AgentText({
          text: "ASSERTION_FAILED|step-01|Login button not found\nRUN_COMPLETED|failed|Step failed",
        }),
      ],
    });

    const finalized = withText.finalizeTextBlock();

    expect(finalized.completedStepCount).toBe(1);
    expect(finalized.steps[0].status).toBe("failed");
    expect(Option.getOrElse(finalized.steps[0].summary, () => "")).toBe("Login button not found");

    const runFinished = finalized.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished).toBeDefined();
    expect(runFinished!.status).toBe("failed");
  });

  it("finalizeTextBlock is idempotent when no AgentText is last event", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "Done" }),
    );

    const finalized = executed.finalizeTextBlock();
    expect(finalized.completedStepCount).toBe(1);
    expect(finalized.steps[0].status).toBe("passed");
  });

  it("addEvent preserves step title when streaming chunks split the marker", () => {
    let executed = makeEmptyExecuted();

    const chunk = (text: string) =>
      new AcpAgentMessageChunk({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text" as const, text },
      });

    executed = executed.addEvent(chunk("STEP_START|step-01"));
    executed = executed.addEvent(chunk("|Navigate to nisar.io\n"));
    executed = executed.addEvent(chunk("Opening browser...\n"));
    executed = executed.addEvent(chunk("ASSERTION_FAILED|step-01|DNS failed\n"));
    executed = executed.addEvent(chunk("RUN_COMPLETED|failed|DNS resolution failed\n"));

    const finalized = executed.finalizeTextBlock();

    expect(finalized.steps.length).toBe(1);
    expect(finalized.steps[0].title).toBe("Navigate to nisar.io");
    expect(finalized.steps[0].status).toBe("failed");
    expect(finalized.hasRunFinished).toBe(true);
  });
});

describe("run completion detection", () => {
  it("hasRunFinished returns false when no RunFinished event exists", () => {
    const executed = makeEmptyExecuted();
    expect(executed.hasRunFinished).toBe(false);
  });

  it("hasRunFinished returns true when RunFinished event exists", () => {
    const executed = new ExecutedTestPlan({
      ...makeEmptyPlan(),
      events: [
        new RunStarted({ plan: makeEmptyPlan() }),
        new RunFinished({ status: "passed", summary: "All done" }),
      ],
    });
    expect(executed.hasRunFinished).toBe(true);
  });

  it("allStepsTerminal returns false with no steps", () => {
    const executed = makeEmptyExecuted();
    expect(executed.allStepsTerminal).toBe(false);
  });

  it("allStepsTerminal returns false with an active step", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "Active" }),
    );
    expect(executed.allStepsTerminal).toBe(false);
  });

  it("allStepsTerminal returns true when all steps are passed/failed/skipped", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "OK" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-02"), title: "Second" }),
    );
    executed = executed.applyMarker(
      new StepFailed({ stepId: StepId.makeUnsafe("step-02"), message: "Broke" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-03"), title: "Third" }),
    );
    executed = executed.applyMarker(
      new StepSkipped({ stepId: StepId.makeUnsafe("step-03"), reason: "N/A" }),
    );
    expect(executed.allStepsTerminal).toBe(true);
  });

  it("synthesizeRunFinished marks failed when no steps were executed", () => {
    const executed = makeEmptyExecuted();
    const result = executed.synthesizeRunFinished();
    const runFinished = result.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished).toBeDefined();
    expect(runFinished!.status).toBe("failed");
    expect(runFinished!.summary).toBe("Agent completed without executing any test steps");
  });

  it("synthesizeRunFinished creates RunFinished with correct status for mixed results", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "OK" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-02"), title: "Second" }),
    );
    executed = executed.applyMarker(
      new StepFailed({ stepId: StepId.makeUnsafe("step-02"), message: "Broke" }),
    );

    const result = executed.synthesizeRunFinished();
    const runFinished = result.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished).toBeDefined();
    expect(runFinished!.status).toBe("failed");
    expect(runFinished!.summary).toBe("Run auto-completed: 1 passed, 1 failed");
  });

  it("synthesizeRunFinished marks passed when all steps pass", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "OK" }),
    );

    const result = executed.synthesizeRunFinished();
    const runFinished = result.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished).toBeDefined();
    expect(runFinished!.status).toBe("passed");
  });

  it("synthesizeRunFinished includes skipped count in summary", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "OK" }),
    );
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-02"), title: "Second" }),
    );
    executed = executed.applyMarker(
      new StepSkipped({ stepId: StepId.makeUnsafe("step-02"), reason: "N/A" }),
    );

    const result = executed.synthesizeRunFinished();
    const runFinished = result.events.find(
      (event): event is RunFinished => event._tag === "RunFinished",
    );
    expect(runFinished!.summary).toBe("Run auto-completed: 1 passed, 0 failed, 1 skipped");
  });

  it("synthesizeRunFinished is idempotent when RunFinished already exists", () => {
    let executed = makeEmptyExecuted();
    executed = executed.applyMarker(
      new StepStarted({ stepId: StepId.makeUnsafe("step-01"), title: "First" }),
    );
    executed = executed.applyMarker(
      new StepCompleted({ stepId: StepId.makeUnsafe("step-01"), summary: "OK" }),
    );

    const withFinish = new ExecutedTestPlan({
      ...executed,
      events: [...executed.events, new RunFinished({ status: "passed", summary: "Agent summary" })],
    });

    const result = withFinish.synthesizeRunFinished();
    expect(result).toBe(withFinish);
    const allFinished = result.events.filter((event) => event._tag === "RunFinished");
    expect(allFinished.length).toBe(1);
  });
});
