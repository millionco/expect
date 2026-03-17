import { Effect } from "effect";
import { useQuery } from "@tanstack/react-query";
import { listSavedFlows, type SavedFlowSummary } from "@browser-tester/supervisor";
import { CliRuntime } from "../runtime.js";

export const EMPTY_SAVED_FLOWS: SavedFlowSummary[] = [];

export const useSavedFlows = () =>
  useQuery({
    queryKey: ["saved-flows"],
    queryFn: () =>
      CliRuntime.runPromise(
        listSavedFlows().pipe(
          Effect.catchTag("FlowStorageError", () => Effect.succeed([] as SavedFlowSummary[])),
        ),
      ),
  });
