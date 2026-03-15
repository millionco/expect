import { describe, expect, it } from "vitest";
import type { BrowserRunEvent } from "../src/events.js";
import {
  buildStepTitleOverlayFilter,
  escapeFilterText,
  getHighlightWindows,
} from "../src/create-browser-run-report.js";

const BASE_TIMESTAMP = 1_000_000;

const runStarted = (offsetMs = 0): BrowserRunEvent => ({
  type: "run-started",
  timestamp: BASE_TIMESTAMP + offsetMs,
  planTitle: "Test plan",
});

const stepStarted = (offsetMs: number, stepId: string, title: string): BrowserRunEvent => ({
  type: "step-started",
  timestamp: BASE_TIMESTAMP + offsetMs,
  stepId,
  title,
});

const stepCompleted = (offsetMs: number, stepId: string): BrowserRunEvent => ({
  type: "step-completed",
  timestamp: BASE_TIMESTAMP + offsetMs,
  stepId,
  summary: "Done",
});

const toolCall = (offsetMs: number, toolName: string): BrowserRunEvent => ({
  type: "tool-call",
  timestamp: BASE_TIMESTAMP + offsetMs,
  toolName,
  input: "{}",
});

const assertionFailed = (offsetMs: number, stepId: string): BrowserRunEvent => ({
  type: "assertion-failed",
  timestamp: BASE_TIMESTAMP + offsetMs,
  stepId,
  message: "Assertion failed",
});

describe("escapeFilterText", () => {
  it("returns text unchanged when no single quotes", () => {
    expect(escapeFilterText("Navigate to homepage")).toBe("Navigate to homepage");
  });

  it("escapes single quotes to doubled single quotes", () => {
    expect(escapeFilterText("Check user's profile")).toBe("Check user''s profile");
  });

  it("escapes multiple single quotes", () => {
    expect(escapeFilterText("it's the user's page")).toBe("it''s the user''s page");
  });
});

describe("buildStepTitleOverlayFilter", () => {
  it("produces drawbox and drawtext filter components", () => {
    const filter = buildStepTitleOverlayFilter("Navigate to homepage");
    expect(filter).toContain("drawbox=");
    expect(filter).toContain("drawtext=");
    expect(filter).toContain("text='Navigate to homepage'");
    expect(filter).toContain("fontcolor=white");
  });

  it("escapes single quotes in the title", () => {
    const filter = buildStepTitleOverlayFilter("Check user's profile");
    expect(filter).toContain("text='Check user''s profile'");
  });
});

describe("getHighlightWindows", () => {
  it("returns full run as single window when no interesting events", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      { type: "text", timestamp: BASE_TIMESTAMP + 5000, text: "Some text" },
    ];

    const windows = getHighlightWindows(events);

    expect(windows).toEqual([{ startMs: 0, endMs: 5000 }]);
  });

  it("attaches step title from step-started events", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      stepStarted(5000, "01", "Navigate to homepage"),
      stepCompleted(20000, "01"),
    ];

    const windows = getHighlightWindows(events);

    expect(windows[0].title).toBe("Navigate to homepage");
  });

  it("carries step title to subsequent tool-call events", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      stepStarted(5000, "01", "Navigate to homepage"),
      toolCall(5500, "browser__click"),
      toolCall(6000, "browser__type"),
      stepCompleted(20000, "01"),
    ];

    const windows = getHighlightWindows(events);

    for (const window of windows) {
      expect(window.title).toBe("Navigate to homepage");
    }
  });

  it("updates title when a new step starts", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      stepStarted(5000, "01", "Navigate to homepage"),
      stepCompleted(10000, "01"),
      stepStarted(25000, "02", "Fill in the form"),
      stepCompleted(35000, "02"),
    ];

    const windows = getHighlightWindows(events);

    const titles = windows.map((window) => window.title);
    expect(titles).toContain("Navigate to homepage");
    expect(titles).toContain("Fill in the form");
  });

  it("keeps first title when merging overlapping windows", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      stepStarted(5000, "01", "First step"),
      stepCompleted(6000, "01"),
      stepStarted(6500, "02", "Second step"),
      stepCompleted(20000, "02"),
    ];

    const windows = getHighlightWindows(events);

    expect(windows[0].title).toBe("First step");
  });

  it("excludes tool calls with ignored suffixes", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      toolCall(5000, "browser__wait"),
      toolCall(6000, "browser__snapshot"),
      toolCall(7000, "browser__get_page_text"),
      toolCall(8000, "browser__read_console_messages"),
      toolCall(9000, "browser__read_network_requests"),
      { type: "text", timestamp: BASE_TIMESTAMP + 15000, text: "end" },
    ];

    const windows = getHighlightWindows(events);

    expect(windows).toEqual([{ startMs: 0, endMs: 15000 }]);
  });

  it("includes assertion-failed events with current step title", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      stepStarted(5000, "01", "Verify login"),
      assertionFailed(8000, "01"),
      stepCompleted(30000, "01"),
    ];

    const windows = getHighlightWindows(events);

    const windowCoveringAssertion = windows.find(
      (window) => window.startMs <= 7200 && window.endMs >= 10200,
    );
    expect(windowCoveringAssertion).toBeDefined();
    expect(windowCoveringAssertion?.title).toBe("Verify login");
  });

  it("leaves title undefined when no step-started precedes the event", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      toolCall(5000, "browser__click"),
      { type: "text", timestamp: BASE_TIMESTAMP + 30000, text: "end" },
    ];

    const windows = getHighlightWindows(events);

    expect(windows[0].title).toBeUndefined();
  });

  it("includes interesting tool calls but not ignored ones", () => {
    const events: BrowserRunEvent[] = [
      runStarted(),
      stepStarted(5000, "01", "Interact with page"),
      toolCall(6000, "browser__click"),
      toolCall(7000, "browser__snapshot"),
      toolCall(20000, "browser__fill"),
      stepCompleted(30000, "01"),
    ];

    const windows = getHighlightWindows(events);
    const allCovered = windows.some(
      (window) => window.startMs <= 5200 && window.endMs >= 22200,
    );
    expect(allCovered).toBe(false);
  });
});
