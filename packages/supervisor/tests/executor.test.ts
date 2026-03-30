import { describe, it, expect } from "vitest";
import { Effect, Layer, Option, Schema, Stream } from "effect";
import {
  ExecutedTestPlan,
  TestPlan,
  TestPlanStep,
  StepId,
  PlanId,
  ChangesFor,
  AcpSessionUpdate,
} from "@expect/shared/models";
import { Agent, AgentStreamOptions } from "@expect/agent";
import { Executor } from "../src/executor";
import { Git } from "../src/git/git";

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

const fixtureUpdatesWithLateClose = [
  {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "STEP_START|step-01|CLI Application Startup\n" },
  },
  {
    sessionUpdate: "agent_message_chunk",
    content: {
      type: "text",
      text: "STEP_DONE|step-01|CLI started successfully\nRUN_COMPLETED|passed|All done",
    },
  },
  {
    sessionUpdate: "tool_call",
    toolCallId: "tool-close",
    title: "close",
    status: "pending",
    rawInput: {},
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "tool-close",
    title: "close",
    status: "completed",
    rawOutput: { text: "Browser closed.\nrrweb replay: /tmp/session.ndjson" },
  },
].map((update) => decode(update));

const agentTestLayer = (updates: typeof fixtureUpdatesWithLateClose) =>
  Layer.succeed(
    Agent,
    Agent.of({
      stream: (_options: AgentStreamOptions) => Stream.fromIterable(updates),
      createSession: () => Effect.die("createSession not supported in tests"),
    }),
  );

const gitTestLayer = Layer.succeed(
  Git,
  Git.of({
    withRepoRoot:
      () =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect,
    getMainBranch: Effect.succeed("main"),
    getCurrentBranch: Effect.succeed("feat/test"),
    isInsideWorkTree: Effect.succeed(true),
    getFileStats: () => Effect.succeed([]),
    getChangedFiles: () => Effect.succeed([]),
    getDiffPreview: () => Effect.succeed(""),
    getRecentCommits: () => Effect.succeed([]),
    getCommitSummary: () => Effect.succeed(undefined),
    getState: Effect.die("getState not supported in tests"),
    computeFingerprint: Effect.die("computeFingerprint not supported in tests"),
    saveTestedFingerprint: Effect.void,
  }),
);

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

  it("keeps streaming long enough to capture the close tool result after run completion", async () => {
    const executed = await Effect.runPromise(
      Effect.gen(function* () {
        const executor = yield* Executor;
        const finalPlan = yield* executor
          .execute({
            changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
            instruction: "test",
            isHeadless: true,
            cookieBrowserKeys: [],
          })
          .pipe(Stream.runLast);

        return Option.getOrUndefined(finalPlan);
      }).pipe(
        Effect.provide(
          Executor.layer.pipe(
            Layer.provide(agentTestLayer(fixtureUpdatesWithLateClose)),
            Layer.provide(gitTestLayer),
          ),
        ),
      ),
    );

    expect(executed).toBeDefined();
    expect(
      executed?.events.some(
        (event) => event._tag === "ToolResult" && event.toolName === "close" && !event.isError,
      ),
    ).toBe(true);
  });
});
