import { Effect, Option } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Git, Planner, TestPlanDraft } from "@browser-tester/supervisor";
import type { ChangesFor } from "@browser-tester/shared/models";
import { cliAtomRuntime } from "./runtime.js";

interface CreatePlanInput {
  readonly changesFor: ChangesFor;
  readonly flowInstruction: string;
}

export const createPlanFn = cliAtomRuntime.fn(
  Effect.fnUntraced(
    function* (input: CreatePlanInput, _ctx: Atom.FnContext) {
      const git = yield* Git;
      const currentBranch = yield* git.getCurrentBranch;
      const fileStats = yield* git.getFileStats(input.changesFor);
      const diffPreview = yield* git.getDiffPreview(input.changesFor);

      const draft = new TestPlanDraft({
        changesFor: input.changesFor,
        currentBranch,
        diffPreview,
        fileStats: [...fileStats],
        instruction: input.flowInstruction,
        baseUrl: Option.none(),
        isHeadless: false,
        requiresCookies: false,
      });

      const planner = yield* Planner;
      return yield* planner.plan(draft);
    },
    Effect.annotateLogs({ fn: "createPlanFn" }),
  ),
);
