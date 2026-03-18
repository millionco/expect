import type { GitState } from "@browser-tester/shared/models";
import type { ContextOption } from "./context-options.js";

const DEFAULT_SUGGESTIONS: readonly string[] = [
  "Test the main user flow end to end",
  "Smoke test the homepage and key pages",
  "Check authentication and protected routes",
];

const CHANGES_SUGGESTIONS: readonly string[] = [
  "Verify my recent changes work as expected",
  "Check for regressions in related features",
  "Test the main user flow end to end",
];

const BRANCH_SUGGESTIONS: readonly string[] = [
  "Test the changes on this branch",
  "Smoke test this branch end to end",
  "Check for regressions on this branch",
];

const PR_SUGGESTIONS: readonly string[] = [
  "Test the changes in this pull request",
  "Check for regressions introduced by this PR",
  "Verify the PR works end to end",
];

const COMMIT_SUGGESTIONS: readonly string[] = [
  "Test the changes from this commit",
  "Check if this commit introduces regressions",
  "Verify this commit works as expected",
];

export const getFlowSuggestions = (
  context: ContextOption | null,
  _gitState: GitState | null,
): readonly string[] => {
  if (!context) return DEFAULT_SUGGESTIONS;
  switch (context.type) {
    case "changes":
      return CHANGES_SUGGESTIONS;
    case "branch":
      return BRANCH_SUGGESTIONS;
    case "pr":
      return PR_SUGGESTIONS;
    case "commit":
      return COMMIT_SUGGESTIONS;
    default:
      return DEFAULT_SUGGESTIONS;
  }
};
