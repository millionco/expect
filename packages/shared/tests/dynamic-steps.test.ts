import { describe, expect, it } from "vite-plus/test";
import { Option } from "effect";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
  StepStarted,
  StepCompleted,
  StepFailed,
  RunStarted,
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
    requiresCookies: false,
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
});
