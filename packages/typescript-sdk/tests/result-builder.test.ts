import { describe, it, expect } from "vite-plus/test";
import { Option } from "effect";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
  RunStarted,
  StepStarted,
  StepCompleted,
  StepFailed,
  StepSkipped,
  RunFinished,
  ToolResult,
} from "@expect/shared/models";
import {
  buildStepResult,
  buildTestResult,
  diffEvents,
  extractArtifacts,
} from "../src/result-builder";

const NO_ARTIFACTS = { recordingPath: undefined, screenshotPaths: [] as string[] };

const makeStep = (
  overrides: Partial<{
    id: string;
    title: string;
    status: "pending" | "active" | "passed" | "failed" | "skipped";
    summary: string;
  }> = {},
): TestPlanStep =>
  new TestPlanStep({
    id: StepId.makeUnsafe(overrides.id ?? "step-1"),
    title: overrides.title ?? "test step",
    instruction: "test instruction",
    expectedOutcome: "expected",
    routeHint: Option.none(),
    status: overrides.status ?? "pending",
    summary: overrides.summary ? Option.some(overrides.summary) : Option.none(),
    startedAt: Option.none(),
    endedAt: Option.none(),
  });

const makePlan = (steps: TestPlanStep[] = []): TestPlan =>
  new TestPlan({
    id: PlanId.makeUnsafe("plan-1"),
    changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
    currentBranch: "main",
    diffPreview: "",
    fileStats: [],
    instruction: "test",
    baseUrl: Option.none(),
    isHeadless: true,
    cookieBrowserKeys: [],
    testCoverage: Option.none(),
    title: "Test Plan",
    rationale: "testing",
    steps,
  });

const makeExecuted = (
  steps: TestPlanStep[] = [],
  events: readonly (typeof import("@expect/shared/models").ExecutionEvent.Type)[] = [],
): ExecutedTestPlan => {
  const plan = makePlan(steps);
  return new ExecutedTestPlan({ ...plan, steps, events });
};

describe("buildStepResult", () => {
  it("maps passed step", () => {
    const step = makeStep({ status: "passed", summary: "All good" });
    const result = buildStepResult(step, [], 0);
    expect(result.status).toBe("passed");
    expect(result.summary).toBe("All good");
    expect(result.title).toBe("test step");
  });

  it("maps failed step", () => {
    const step = makeStep({ status: "failed", summary: "Something broke" });
    const result = buildStepResult(step, [], 0);
    expect(result.status).toBe("failed");
    expect(result.summary).toBe("Something broke");
  });

  it("maps skipped step to failed", () => {
    const step = makeStep({ status: "skipped", summary: "Not applicable" });
    const result = buildStepResult(step, [], 0);
    expect(result.status).toBe("failed");
  });

  it("maps pending step", () => {
    const step = makeStep({ status: "pending" });
    const result = buildStepResult(step, [], 0);
    expect(result.status).toBe("pending");
    expect(result.summary).toBe("");
  });

  it("maps active step to pending", () => {
    const step = makeStep({ status: "active" });
    const result = buildStepResult(step, [], 0);
    expect(result.status).toBe("pending");
  });

  it("associates screenshot path by index", () => {
    const step = makeStep({ status: "passed", summary: "ok" });
    const result = buildStepResult(step, ["/tmp/s0.png", "/tmp/s1.png"], 1);
    expect(result.screenshotPath).toBe("/tmp/s1.png");
  });
});

describe("buildTestResult", () => {
  it("returns passed when all steps passed", () => {
    const executed = makeExecuted([
      makeStep({ id: "s1", status: "passed", summary: "ok" }),
      makeStep({ id: "s2", status: "passed", summary: "ok" }),
    ]);
    const result = buildTestResult(
      executed,
      "http://localhost:3000",
      Date.now() - 1000,
      NO_ARTIFACTS,
    );
    expect(result.status).toBe("passed");
    expect(result.errors).toHaveLength(0);
  });

  it("returns failed when any step failed", () => {
    const executed = makeExecuted([
      makeStep({ id: "s1", status: "passed", summary: "ok" }),
      makeStep({ id: "s2", status: "failed", summary: "broken" }),
    ]);
    const result = buildTestResult(executed, "http://localhost:3000", Date.now(), NO_ARTIFACTS);
    expect(result.status).toBe("failed");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].summary).toBe("broken");
  });

  it("returns pending when steps are still pending", () => {
    const executed = makeExecuted([
      makeStep({ id: "s1", status: "passed", summary: "ok" }),
      makeStep({ id: "s2", status: "pending" }),
    ]);
    const result = buildTestResult(executed, "http://localhost:3000", Date.now(), NO_ARTIFACTS);
    expect(result.status).toBe("pending");
  });

  it("returns pending when no steps exist", () => {
    const executed = makeExecuted();
    const result = buildTestResult(executed, "http://localhost:3000", Date.now(), NO_ARTIFACTS);
    expect(result.status).toBe("pending");
  });

  it("errors equals steps filtered by failed", () => {
    const executed = makeExecuted([
      makeStep({ id: "s1", status: "passed", summary: "ok" }),
      makeStep({ id: "s2", status: "failed", summary: "err1" }),
      makeStep({ id: "s3", status: "failed", summary: "err2" }),
    ]);
    const result = buildTestResult(executed, "http://localhost:3000", Date.now(), NO_ARTIFACTS);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((error) => error.summary)).toEqual(["err1", "err2"]);
  });

  it("includes url", () => {
    const executed = makeExecuted();
    const result = buildTestResult(
      executed,
      "http://localhost:3000/login",
      Date.now(),
      NO_ARTIFACTS,
    );
    expect(result.url).toBe("http://localhost:3000/login");
  });

  it("includes recordingPath from artifacts", () => {
    const executed = makeExecuted();
    const result = buildTestResult(executed, "http://localhost:3000", Date.now(), {
      recordingPath: "/tmp/replay.ndjson",
      screenshotPaths: [],
    });
    expect(result.recordingPath).toBe("/tmp/replay.ndjson");
  });
});

describe("extractArtifacts", () => {
  it("returns empty when no close event", () => {
    const result = extractArtifacts([]);
    expect(result.recordingPath).toBeUndefined();
    expect(result.screenshotPaths).toHaveLength(0);
  });

  it("extracts recording path from close result", () => {
    const events = [
      new ToolResult({
        toolName: "close",
        result: "rrweb replay: /tmp/session.ndjson\nScreenshot: /tmp/s0.png",
        isError: false,
      }),
    ];
    const result = extractArtifacts(events);
    expect(result.recordingPath).toBe("/tmp/session.ndjson");
    expect(result.screenshotPaths).toEqual(["/tmp/s0.png"]);
  });
});

describe("diffEvents", () => {
  const plan = makePlan([makeStep({ id: "s1" })]);
  const startedAt = Date.now();

  it("emits run:started for RunStarted event", () => {
    const events = [new RunStarted({ plan })];
    const executed = makeExecuted(plan.steps as TestPlanStep[], events);
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("run:started");
  });

  it("emits step:started for StepStarted event", () => {
    const events = [new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "test step" })];
    const executed = makeExecuted(plan.steps as TestPlanStep[], events);
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("step:started");
  });

  it("emits step:passed for StepCompleted event", () => {
    const completedStep = makeStep({ id: "s1", status: "passed", summary: "done" });
    const events = [new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "done" })];
    const executed = makeExecuted([completedStep], events);
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("step:passed");
  });

  it("emits step:failed for StepFailed event", () => {
    const failedStep = makeStep({ id: "s1", status: "failed", summary: "broken" });
    const events = [new StepFailed({ stepId: StepId.makeUnsafe("s1"), message: "broken" })];
    const executed = makeExecuted([failedStep], events);
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("step:failed");
  });

  it("emits step:skipped for StepSkipped event", () => {
    const skippedStep = makeStep({ id: "s1", status: "skipped", summary: "not needed" });
    const events = [new StepSkipped({ stepId: StepId.makeUnsafe("s1"), reason: "not applicable" })];
    const executed = makeExecuted([skippedStep], events);
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("step:skipped");
  });

  it("emits completed for RunFinished event", () => {
    const events = [new RunFinished({ status: "passed", summary: "All passed" })];
    const executed = makeExecuted(
      [makeStep({ id: "s1", status: "passed", summary: "ok" })],
      events,
    );
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("completed");
  });

  it("emits screenshot for screenshot ToolResult", () => {
    const events = [
      new ToolResult({
        toolName: "browser__screenshot",
        result: "/tmp/screenshot-0.png",
        isError: false,
      }),
    ];
    const executed = makeExecuted([], events);
    const result = diffEvents([], events, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("screenshot");
  });

  it("only emits new events since previous snapshot", () => {
    const event1 = new StepStarted({ stepId: StepId.makeUnsafe("s1"), title: "step 1" });
    const event2 = new StepCompleted({ stepId: StepId.makeUnsafe("s1"), summary: "done" });
    const allEvents = [event1, event2];
    const completedStep = makeStep({ id: "s1", status: "passed", summary: "done" });
    const executed = makeExecuted([completedStep], allEvents);

    const result = diffEvents([event1], allEvents, executed, "http://localhost:3000", startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("step:passed");
  });
});
