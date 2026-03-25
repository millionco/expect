import { Effect, Option, Schema } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Git, Planner, TestPlanDraft, DraftId } from "@expect/supervisor";
import { PlanId, StepId, TestPlan, TestPlanStep, type ChangesFor } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime.js";

interface CreatePlanInput {
  readonly changesFor: ChangesFor;
  readonly flowInstruction: string;
}

export const createPlanFn = cliAtomRuntime.fn(
  Effect.fnUntraced(
    function* (input: CreatePlanInput, _ctx: Atom.FnContext) {
      // HACK: temporary mock plan for live viewer testing
      return new TestPlan({
        id: Schema.decodeSync(PlanId)("plan-mock-001"),
        title: "Mock test plan",
        rationale: "Temporary mock for live viewer testing",
        changesFor: input.changesFor,
        currentBranch: "main",
        diffPreview: "",
        fileStats: [],
        instruction: input.flowInstruction,
        baseUrl: Option.none(),
        isHeadless: false,
        requiresCookies: false,
        steps: [
          new TestPlanStep({
            id: Schema.decodeSync(StepId)("step-01"),
            title: "Open the homepage",
            instruction: "Navigate to / and verify it loads",
            expectedOutcome: "Page loads with project list",
            routeHint: Option.some("/"),
            status: "pending",
            summary: Option.none(),
            startedAt: Option.none(),
            endedAt: Option.none(),
          }),
          new TestPlanStep({
            id: Schema.decodeSync(StepId)("step-02"),
            title: "Check project list",
            instruction: "Verify project list is visible",
            expectedOutcome: "Projects are listed on the page",
            routeHint: Option.some("/"),
            status: "pending",
            summary: Option.none(),
            startedAt: Option.none(),
            endedAt: Option.none(),
          }),
        ],
      });

      const git = yield* Git;
      const planner = yield* Planner;

      const currentBranch = yield* git.getCurrentBranch;
      const fileStats = yield* git.getFileStats(input.changesFor);
      const diffPreview = yield* git.getDiffPreview(input.changesFor);

      const draft = new TestPlanDraft({
        id: DraftId.makeUnsafe(crypto.randomUUID()),
        changesFor: input.changesFor,
        currentBranch,
        diffPreview,
        fileStats: [...fileStats],
        instruction: input.flowInstruction,
        baseUrl: Option.none(),
        isHeadless: false,
        requiresCookies: false,
      });

      return yield* planner.plan(draft);
    },
    Effect.annotateLogs({ fn: "createPlanFn" }),
  ),
);
