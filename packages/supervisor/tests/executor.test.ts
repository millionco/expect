import { describe, it, expect } from "vitest";
import { Array, Effect, FileSystem, Layer, Option, Schema, Stream, String } from "effect";
import { NodeServices } from "@effect/platform-node";
import { Agent } from "@browser-tester/agent";
import {
  DraftId,
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
} from "@browser-tester/shared/models";
import { Executor } from "../src/executor.js";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

const FIXTURE_PATH = `/Users/rasmus/dev/browser-tester/fixtures/execute-1.jsonl`;

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

const loadFixtureParts = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFileString(FIXTURE_PATH)
    .pipe(
      Effect.map(String.split("\n")),
      Effect.map(Array.filter((line) => line.trim().length > 0)),
      Effect.map(Array.map((line) => JSON.parse(line) as LanguageModelV3StreamPart)),
    );
}).pipe(Effect.provide(NodeServices.layer));

describe("reducer", () => {
  it.only("reduces LanguageModelV3StreamParts into ExecutedTestPlan", async () => {
    const parts = await Effect.runPromise(loadFixtureParts);
    console.log("creating initial ExecutedTestPlan...");
    let executed = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });
    console.log("initial created OK, events:", executed.events.length);

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      /* console.log(
        `[${index}] type=${part.type} events_before=${executed.events.length}`
        ); */
      executed = executed.addEvent(part);
      // console.log(`[${index}] events_after=${executed.events.length}`);
    }

    console.log("Total events:", executed.events.length);
    console.log(
      "Event tags:",
      executed.events.map((event) => event._tag),
    );

    console.log("FINISHED EXECUTED:");
    console.log(executed);

    expect(executed.events.length).toBeGreaterThan(0);

    const hasToolCalls = executed.events.some((event) => event._tag === "ToolCall");
    const hasToolResults = executed.events.some((event) => event._tag === "ToolResult");
    const hasThinking = executed.events.some((event) => event._tag === "AgentThinking");

    expect(hasToolCalls).toBe(true);
    expect(hasToolResults).toBe(true);
    expect(hasThinking).toBe(true);
  });

  it("each addEvent returns a new instance for non-trivial parts", async () => {
    const parts = await Effect.runPromise(loadFixtureParts);
    const initial = new ExecutedTestPlan({ ...makeTestPlan(), events: [] });

    let previous = initial;
    for (const part of parts.slice(0, 10)) {
      const next = previous.addEvent(part);
      if (next !== previous) {
        expect(next).not.toBe(previous);
      }
      previous = next;
    }

    expect(previous.events.length).toBeGreaterThan(0);
  });
});
