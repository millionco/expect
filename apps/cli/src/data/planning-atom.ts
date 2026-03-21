import { Effect, Option } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Git, Planner, TestPlanDraft, DraftId } from "@browser-tester/supervisor";
import type { ChangesFor } from "@browser-tester/shared/models";
import { getCliAtomRuntime } from "./runtime.js";

interface CreatePlanInput {
  readonly changesFor: ChangesFor;
  readonly flowInstruction: string;
}

const initCreatePlanFn = () =>
  getCliAtomRuntime().fn(
    Effect.fnUntraced(
      function* (input: CreatePlanInput, _ctx: Atom.FnContext) {
        const git = yield* Git;
        const planner = yield* Planner;

        const currentBranch = yield* git.getCurrentBranch;
        const fileStats = yield* git.getFileStats(input.changesFor);
        const diffPreview = yield* git.getDiffPreview(input.changesFor);

        console.error("[planning-atom] fileStats:", fileStats.length, "diff:", diffPreview.length);

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

        console.error("[planning-atom] prompt length:", draft.prompt.length);

        const testPlan = yield* planner.plan(draft);

        console.error(
          "[planning-atom] result:",
          JSON.stringify({
            id: testPlan.id,
            title: testPlan.title,
            stepCount: testPlan.steps.length,
            steps: testPlan.steps.map((step) => ({
              id: step.id,
              title: step.title,
            })),
          }),
        );

        return testPlan;
      },
      Effect.annotateLogs({ fn: "createPlanFn" }),
    ),
  );

let _createPlanFn: ReturnType<typeof initCreatePlanFn>;

export const getCreatePlanFn = () => {
  if (!_createPlanFn) {
    _createPlanFn = initCreatePlanFn();
  }
  return _createPlanFn;
};
