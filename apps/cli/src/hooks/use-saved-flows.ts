import { useQuery } from "@tanstack/react-query";
import { Effect, Layer } from "effect";
import { FlowStorage, Git } from "@expect/supervisor";
import type { SavedFlowFileData } from "@expect/supervisor";
import { NodeServices } from "@effect/platform-node";

const savedFlowsLayer = Layer.mergeAll(FlowStorage.layer, Git.withRepoRoot(process.cwd()));

export const useSavedFlows = () =>
  useQuery({
    queryKey: ["saved-flows"],
    queryFn: (): Promise<SavedFlowFileData[]> =>
      Effect.gen(function* () {
        const flowStorage = yield* FlowStorage;
        return yield* flowStorage.list();
      }).pipe(
        Effect.provide(savedFlowsLayer),
        Effect.provide(NodeServices.layer),
        Effect.runPromise,
      ),
  });
