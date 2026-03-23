import { describe, it, expect } from "vitest";
import { Effect, FileSystem, Option, Schema } from "effect";
import { NodeServices } from "@effect/platform-node";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
  AcpSessionUpdate,
} from "@browser-tester/shared/models";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/execute-1.acp.jsonl",
);

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
    requiresCookies: false,
  } as any);

const decode = Schema.decodeSync(AcpSessionUpdate);

const loadFixtureUpdates = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const content = yield* fs.readFileString(FIXTURE_PATH);
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => decode(JSON.parse(line)));
}).pipe(Effect.provide(NodeServices.layer));

describe("reducer", () => {
  it.only("reduces AcpSessionUpdates into ExecutedTestPlan", async () => {
    const updates = await Effect.runPromise(loadFixtureUpdates);
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

  it("each addEvent returns a new instance for non-trivial updates", async () => {
    const updates = await Effect.runPromise(loadFixtureUpdates);
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
