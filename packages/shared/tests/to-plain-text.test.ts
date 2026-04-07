import { describe, expect, it } from "vite-plus/test";
import { Option } from "effect";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  TestReport,
  StepId,
  PlanId,
  ChangesFor,
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  StepSkipped,
  RunFinished,
} from "../src/models";

const makeStep = (
  id: string,
  title: string,
  overrides: Partial<Pick<TestPlanStep, "status">> = {},
): TestPlanStep =>
  new TestPlanStep({
    id: StepId.makeUnsafe(id),
    title,
    instruction: title,
    expectedOutcome: "",
    routeHint: Option.none(),
    status: overrides.status ?? "pending",
    summary: Option.none(),
    startedAt: Option.none(),
    endedAt: Option.none(),
  });

const makePlan = (steps: TestPlanStep[]): TestPlan =>
  new TestPlan({
    id: PlanId.makeUnsafe("plan-01"),
    title: "Test plan",
    rationale: "Test",
    steps,
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

const makeReport = (
  plan: TestPlan,
  events: readonly (
    | RunStarted
    | StepStarted
    | StepCompleted
    | StepFailed
    | StepSkipped
    | RunFinished
  )[],
  summary: string,
): TestReport =>
  new TestReport({
    ...new ExecutedTestPlan({ ...plan, events }),
    summary,
    screenshotPaths: [],
    pullRequest: Option.none(),
    testCoverageReport: Option.none(),
  });

describe("TestReport.toPlainText", () => {
  it("does not duplicate summary text", () => {
    const steps = [makeStep("s1", "Login step"), makeStep("s2", "Submit step")];
    const plan = makePlan(steps);
    const events = [
      new RunStarted({ plan }),
      new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "Login step" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "Logged in" }),
      new StepStarted({ stepId: StepId.makeUnsafe("s2"), title: "Submit step" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s2"), summary: "Submitted" }),
      new RunFinished({ status: "passed", summary: "2 passed, 0 failed" }),
    ];
    const report = makeReport(plan, events, "2 passed, 0 failed");
    const text = report.toPlainText;
    const summaryLineMatches = text.match(/2 passed/g);
    expect(summaryLineMatches?.length).toBe(1);
  });

  it("includes the run summary when it adds new context", () => {
    const steps = [makeStep("s1", "Login step")];
    const plan = makePlan(steps);
    const events = [
      new RunStarted({ plan }),
      new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "Login step" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "Logged in" }),
      new RunFinished({
        status: "passed",
        summary: "Login worked with seeded data and the session stayed authenticated after refresh",
      }),
    ];
    const report = makeReport(
      plan,
      events,
      "Login worked with seeded data and the session stayed authenticated after refresh",
    );
    const text = report.toPlainText;
    expect(text).toContain("Summary\nLogin worked with seeded data");
  });

  it("pluralizes 'step' correctly for singular", () => {
    const steps = [makeStep("s1", "Only step")];
    const plan = makePlan(steps);
    const events = [
      new RunStarted({ plan }),
      new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "Only step" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "Done" }),
      new RunFinished({ status: "passed", summary: "1 passed" }),
    ];
    const report = makeReport(plan, events, "1 passed");
    const text = report.toPlainText;
    expect(text).toContain("out of 1 step");
    expect(text).not.toContain("out of 1 steps");
  });

  it("pluralizes 'step' correctly for plural", () => {
    const steps = [makeStep("s1", "Step A"), makeStep("s2", "Step B")];
    const plan = makePlan(steps);
    const events = [
      new RunStarted({ plan }),
      new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "Step A" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "OK" }),
      new StepStarted({ stepId: StepId.makeUnsafe("s2"), title: "Step B" }),
      new StepFailed({ stepId: StepId.makeUnsafe("s2"), message: "Broke" }),
      new RunFinished({ status: "failed", summary: "1 passed, 1 failed" }),
    ];
    const report = makeReport(plan, events, "1 passed, 1 failed");
    const text = report.toPlainText;
    expect(text).toContain("out of 2 steps");
  });

  it("includes step icons for passed, failed, and skipped", () => {
    const steps = [makeStep("s1", "Passed"), makeStep("s2", "Failed"), makeStep("s3", "Skipped")];
    const plan = makePlan(steps);
    const events = [
      new RunStarted({ plan }),
      new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "Passed" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "OK" }),
      new StepStarted({ stepId: StepId.makeUnsafe("s2"), title: "Failed" }),
      new StepFailed({ stepId: StepId.makeUnsafe("s2"), message: "Error" }),
      new StepStarted({ stepId: StepId.makeUnsafe("s3"), title: "Skipped" }),
      new StepSkipped({ stepId: StepId.makeUnsafe("s3"), reason: "N/A" }),
      new RunFinished({ status: "failed", summary: "mixed" }),
    ];
    const report = makeReport(plan, events, "mixed");
    const text = report.toPlainText;
    expect(text).toContain("\u2713 Passed");
    expect(text).toContain("\u2717 Failed");
    expect(text).toContain("\u2192 Skipped");
  });

  it("includes skipped count in summary line", () => {
    const steps = [makeStep("s1", "Step A"), makeStep("s2", "Step B")];
    const plan = makePlan(steps);
    const events = [
      new RunStarted({ plan }),
      new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "Step A" }),
      new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "OK" }),
      new StepStarted({ stepId: StepId.makeUnsafe("s2"), title: "Step B" }),
      new StepSkipped({ stepId: StepId.makeUnsafe("s2"), reason: "N/A" }),
      new RunFinished({ status: "passed", summary: "mixed" }),
    ];
    const report = makeReport(plan, events, "mixed");
    const text = report.toPlainText;
    expect(text).toContain("1 skipped");
  });
});
