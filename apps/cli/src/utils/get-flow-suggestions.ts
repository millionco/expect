import { getFlowSuggestionsFromContext, type GitState } from "@browser-tester/supervisor";
import type { ContextOption } from "./context-options.js";

export const getFlowSuggestions = (
  context: ContextOption | null,
  gitState: GitState | null,
): readonly string[] =>
  getFlowSuggestionsFromContext(context?.type ?? null, gitState?.changedFiles ?? []);
