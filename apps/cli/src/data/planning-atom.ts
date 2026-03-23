import { Effect, Option } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Agent } from "@browser-tester/agent";
import { Git, Planner, TestPlanDraft, DraftId } from "@browser-tester/supervisor";
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
