import { describe, expect, it } from "vite-plus/test";
import {
  INITIAL_WATCH_STATE,
  WatchAssessmentResponseParseError,
  advanceWatchState,
  assessWatchHeuristic,
  markWatchHandled,
  markWatchRunFinished,
  markWatchRunStarted,
  parseWatchAssessmentResponse,
} from "../src/watch";

describe("watch heuristics", () => {
  it("skips browser runs for docs-only changes", () => {
    const decision = assessWatchHeuristic({
      changedFiles: [{ path: "README.md", status: "M" }],
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("documentation");
  });

  it("runs immediately for browser-facing component changes", () => {
    const decision = assessWatchHeuristic({
      changedFiles: [{ path: "src/app/button.tsx", status: "M" }],
    });

    expect(decision.action).toBe("run");
    expect(decision.reason).toContain("Browser-facing files changed");
  });

  it("runs when changed code lacks automated coverage", () => {
    const decision = assessWatchHeuristic({
      changedFiles: [{ path: "src/app/use-dashboard.ts", status: "M" }],
      testCoverage: {
        entries: [
          {
            path: "src/app/use-dashboard.ts",
            testFiles: [],
            covered: false,
          },
        ],
        coveredCount: 0,
        totalCount: 1,
        percent: 0,
      },
    });

    expect(decision.action).toBe("run");
    expect(decision.reason).toContain("without automated coverage");
  });

  it("treats config changes as borderline", () => {
    const decision = assessWatchHeuristic({
      changedFiles: [{ path: "package.json", status: "M" }],
    });

    expect(decision.action).toBe("borderline");
  });
});

describe("watch assessment parsing", () => {
  it("parses a yes response", () => {
    expect(parseWatchAssessmentResponse("RUN_TEST|yes|shared client logic changed")).toEqual({
      shouldRun: true,
      reason: "shared client logic changed",
      source: "agent",
    });
  });

  it("rejects malformed responses", () => {
    expect(() => parseWatchAssessmentResponse("yes")).toThrow(WatchAssessmentResponseParseError);
  });
});

describe("watch state coordination", () => {
  it("debounces rapid successive changes", () => {
    const firstPoll = advanceWatchState(INITIAL_WATCH_STATE, {
      fingerprint: "fingerprint-1",
      hasChanges: true,
      nowMs: 100,
      settleDelayMs: 200,
    });

    expect(firstPoll.changeDetected).toBe(true);
    expect(firstPoll.shouldAssess).toBe(false);

    const secondPoll = advanceWatchState(firstPoll.state, {
      fingerprint: "fingerprint-1",
      hasChanges: true,
      nowMs: 250,
      settleDelayMs: 200,
    });

    expect(secondPoll.shouldAssess).toBe(false);

    const settledPoll = advanceWatchState(secondPoll.state, {
      fingerprint: "fingerprint-1",
      hasChanges: true,
      nowMs: 350,
      settleDelayMs: 200,
    });

    expect(settledPoll.shouldAssess).toBe(true);
  });

  it("queues exactly one rerun while a run is active", () => {
    const runningState = markWatchRunStarted(INITIAL_WATCH_STATE, "fingerprint-1");

    const queued = advanceWatchState(runningState, {
      fingerprint: "fingerprint-2",
      hasChanges: true,
      nowMs: 100,
      settleDelayMs: 200,
    });

    expect(queued.rerunQueued).toBe(true);
    expect(queued.state.rerunQueued).toBe(true);

    const duplicateQueue = advanceWatchState(queued.state, {
      fingerprint: "fingerprint-3",
      hasChanges: true,
      nowMs: 150,
      settleDelayMs: 200,
    });

    expect(duplicateQueue.rerunQueued).toBe(false);
    expect(duplicateQueue.state.rerunQueued).toBe(true);

    const finished = markWatchHandled(markWatchRunFinished(duplicateQueue.state), "fingerprint-1");
    expect(finished.runningFingerprint).toBeUndefined();
    expect(finished.rerunQueued).toBe(false);
    expect(finished.handledFingerprint).toBe("fingerprint-1");
  });
});
