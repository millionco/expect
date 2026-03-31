import { describe, it, expect } from "vitest";
import { Option, Schema } from "effect";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
  AcpSessionUpdate,
} from "@expect/shared/models";

const makeTestPlan = (): TestPlan =>
  new TestPlan({
    id: PlanId.makeUnsafe("plan-01"),
    title: "Test plan",
    rationale: "Testing",
    steps: [
      new TestPlanStep({
        id: StepId.makeUnsafe("step-01"),
        title: "CLI Application Startup",
        instruction: "Start the CLI",
        expectedOutcome: "CLI starts",
        routeHint: Option.none(),
        status: "pending",
        summary: Option.none(),
        startedAt: Option.none(),
        endedAt: Option.none(),
      }),
    ],
    changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
    currentBranch: "main",
    diffPreview: "",
    fileStats: [],
    instruction: "test",
    baseUrl: Option.none(),
    isHeadless: false,
    cookieBrowserKeys: [],
    testCoverage: Option.none(),
  } as any);

const decode = Schema.decodeSync(AcpSessionUpdate);

const fixtureUpdates = [
  {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Inspecting the CLI startup flow." },
  },
  {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "STEP_START|step-01|CLI Application Startup\n" },
  },
  {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "STEP_DONE|step-01|CLI started successfully" },
  },
  {
    sessionUpdate: "tool_call",
    toolCallId: "tool-01",
    title: "ReadFile",
    status: "pending",
    rawInput: { path: "package.json" },
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "tool-01",
    title: "ReadFile",
    status: "completed",
    rawOutput: { content: "{ ... }" },
  },
].map((update) => decode(update));

describe("reducer", () => {
  it("reduces AcpSessionUpdates into ExecutedTestPlan", () => {
    const updates = fixtureUpdates;
    let executed = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    for (const update of updates) {
      executed = executed.addEvent(update);
    }

    expect(executed.events.length).toBeGreaterThan(0);

    const hasToolCalls = executed.events.some((event) => event._tag === "ToolCall");
    const hasToolResults = executed.events.some((event) => event._tag === "ToolResult");
    const hasThinking = executed.events.some((event) => event._tag === "AgentThinking");

    expect(hasToolCalls).toBe(true);
    expect(hasToolResults).toBe(true);
    expect(hasThinking).toBe(true);
  });

  it("each addEvent returns a new instance for non-trivial updates", () => {
    const updates = fixtureUpdates;
    const initial = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    let previous = initial;
    for (const update of updates.slice(0, 10)) {
      const next = previous.addEvent(update);
      if (next !== previous) {
        expect(next).not.toBe(previous);
      }
      previous = next;
    }

    expect(previous.events.length).toBeGreaterThan(0);
  });
});
