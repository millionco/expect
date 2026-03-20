import { describe, expect, it } from "vite-plus/test";
import type { BrowserRunEvent } from "@browser-tester/supervisor";
import { deriveTestingState } from "@browser-tester/supervisor";

describe("deriveTestingState", () => {
  it("starts with no discovered steps before execution emits them", () => {
    const state = deriveTestingState([], "compact");

    expect(state.steps).toEqual([]);
  });

  it("keeps only the latest started step active", () => {
    const events: BrowserRunEvent[] = [
      {
        type: "step-started",
        timestamp: 1_000,
        stepId: "step-1",
        title: "Open the page",
      },
      {
        type: "step-started",
        timestamp: 2_000,
        stepId: "step-2",
        title: "Submit the form",
      },
    ];

    const state = deriveTestingState(events, "compact");

    expect(state.steps).toEqual([
      {
        stepId: "step-1",
        status: "passed",
        label: "Open the page",
        elapsedMs: null,
      },
      {
        stepId: "step-2",
        status: "active",
        label: "Submit the form",
        elapsedMs: null,
      },
    ]);
  });

  it("activates the next pending step when a step finishes", () => {
    const events: BrowserRunEvent[] = [
      {
        type: "step-started",
        timestamp: 1_000,
        stepId: "step-1",
        title: "Open the page",
      },
      {
        type: "step-completed",
        timestamp: 2_000,
        stepId: "step-1",
        summary: "Opened the page",
      },
    ];

    const state = deriveTestingState(events, "compact");

    expect(state.steps).toEqual([
      {
        stepId: "step-1",
        status: "passed",
        label: "Opened the page",
        elapsedMs: null,
      },
    ]);
  });

  it("records accumulated elapsed time from run start", () => {
    const events: BrowserRunEvent[] = [
      {
        type: "run-started",
        timestamp: 0,
        title: "Regression test",
        liveViewUrl: undefined,
      },
      {
        type: "step-started",
        timestamp: 100,
        stepId: "step-1",
        title: "Open the page",
      },
      {
        type: "step-completed",
        timestamp: 3_500,
        stepId: "step-1",
        summary: "Opened the page",
      },
      {
        type: "step-started",
        timestamp: 4_000,
        stepId: "step-2",
        title: "Submit the form",
      },
      {
        type: "step-completed",
        timestamp: 7_200,
        stepId: "step-2",
        summary: "Submitted the form",
      },
    ];

    const state = deriveTestingState(events, "compact");

    expect(state.steps).toEqual([
      {
        stepId: "step-1",
        status: "passed",
        label: "Opened the page",
        elapsedMs: 3_500,
      },
      {
        stepId: "step-2",
        status: "passed",
        label: "Submitted the form",
        elapsedMs: 7_200,
      },
    ]);
  });
});
