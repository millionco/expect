import { Channel, Effect, Option } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { Git, Planner, TestPlanDraft, DraftId } from "@expect/supervisor";
import { AcpSessionUpdate, ChangesFor } from "@expect/shared/models";
import { cliAtomRuntime } from "./runtime.js";

interface CreatePlanInput {
  readonly changesFor: ChangesFor;
  readonly flowInstruction: string;
  onUpdate: (updates: readonly AcpSessionUpdate[]) => void;
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

      return yield* planner.plan(draft).pipe(
        Channel.runForEach((updates) => Effect.sync(() => input.onUpdate(updates))),
        Effect.retry({ times: 3 }),
      );
    },
    Effect.annotateLogs({ fn: "createPlanFn" }),
  ),
);
