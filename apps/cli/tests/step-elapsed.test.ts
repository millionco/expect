import { describe, expect, it } from "vite-plus/test";
import { DateTime, Option } from "effect";
import { TestPlanStep, StepId } from "@expect/shared/models";
import { getStepElapsedMs, getTotalElapsedMs } from "../src/utils/step-elapsed";

const makeDateTime = (epochMs: number) => DateTime.makeUnsafe(new Date(epochMs));

const makeStep = (
  overrides: Partial<{
    startedAt: Option.Option<DateTime.Utc>;
    endedAt: Option.Option<DateTime.Utc>;
  }> = {},
): TestPlanStep =>
  new TestPlanStep({
    id: StepId.makeUnsafe("step-01"),
    title: "Test step",
    instruction: "Do something",
    expectedOutcome: "Something happens",
    routeHint: Option.none(),
    status: "passed",
    summary: Option.none(),
    startedAt: overrides.startedAt ?? Option.none(),
    endedAt: overrides.endedAt ?? Option.none(),
  });

describe("getStepElapsedMs", () => {
  it("returns undefined when startedAt is missing", () => {
    const step = makeStep({ endedAt: Option.some(makeDateTime(1000)) });
    expect(getStepElapsedMs(step)).toBeUndefined();
  });

  it("returns undefined when endedAt is missing", () => {
    const step = makeStep({ startedAt: Option.some(makeDateTime(1000)) });
    expect(getStepElapsedMs(step)).toBeUndefined();
  });

  it("returns undefined when both are missing", () => {
    const step = makeStep();
    expect(getStepElapsedMs(step)).toBeUndefined();
  });

  it("calculates elapsed milliseconds when both timestamps exist", () => {
    const step = makeStep({
      startedAt: Option.some(makeDateTime(1000)),
      endedAt: Option.some(makeDateTime(3500)),
    });
    expect(getStepElapsedMs(step)).toBe(2500);
  });

  it("returns 0 when start and end are the same", () => {
    const step = makeStep({
      startedAt: Option.some(makeDateTime(5000)),
      endedAt: Option.some(makeDateTime(5000)),
    });
    expect(getStepElapsedMs(step)).toBe(0);
  });
});

describe("getTotalElapsedMs", () => {
  it("returns 0 for empty steps array", () => {
    expect(getTotalElapsedMs([])).toBe(0);
  });

  it("returns 0 when no steps have timestamps", () => {
    const steps = [makeStep(), makeStep()];
    expect(getTotalElapsedMs(steps)).toBe(0);
  });

  it("sums elapsed time across all steps with timestamps", () => {
    const steps = [
      makeStep({
        startedAt: Option.some(makeDateTime(0)),
        endedAt: Option.some(makeDateTime(1000)),
      }),
      makeStep({
        startedAt: Option.some(makeDateTime(1000)),
        endedAt: Option.some(makeDateTime(3000)),
      }),
    ];
    expect(getTotalElapsedMs(steps)).toBe(3000);
  });

  it("skips steps without timestamps in the sum", () => {
    const steps = [
      makeStep({
        startedAt: Option.some(makeDateTime(0)),
        endedAt: Option.some(makeDateTime(1500)),
      }),
      makeStep(),
      makeStep({
        startedAt: Option.some(makeDateTime(2000)),
        endedAt: Option.some(makeDateTime(4000)),
      }),
    ];
    expect(getTotalElapsedMs(steps)).toBe(3500);
  });
});
