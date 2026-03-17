import type { ChangedFile } from "./git/index.js";
import { categorizeChangedFiles } from "./utils/categorize-changed-files.js";

export type ContextType = "changes" | "pr" | "branch" | "commit";

const PR_SUGGESTIONS: readonly string[] = [
  "Test the changes in this pull request",
  "Check for regressions introduced by this PR",
  "Verify the PR works end to end",
];

const BRANCH_SUGGESTIONS: readonly string[] = [
  "Test the changes on this branch",
  "Smoke test this branch end to end",
  "Check for regressions on this branch",
];

const COMMIT_SUGGESTIONS: readonly string[] = [
  "Test the changes from this commit",
  "Check if this commit introduces regressions",
  "Verify this commit works as expected",
];

const DEFAULT_SUGGESTIONS: readonly string[] = [
  "Test the main user flow end to end",
  "Smoke test the homepage and key pages",
  "Check authentication and protected routes",
];

const buildChangesSuggestions = (changedFiles: readonly ChangedFile[]): readonly string[] => {
  if (changedFiles.length === 0) {
    return [
      "Verify my recent changes work as expected",
      "Check for regressions in related features",
      "Test the main user flow end to end",
    ];
  }

  const { categories, totalWebFiles } = categorizeChangedFiles(changedFiles);
  const suggestions: string[] = [];

  const componentCategory = categories.find((category) => category.label === "component");
  const styleCategory = categories.find((category) => category.label === "stylesheet");
  const moduleCategory = categories.find((category) => category.label === "module");

  if (componentCategory) {
    suggestions.push(
      `Test the ${componentCategory.count} changed component${componentCategory.count === 1 ? "" : "s"} render correctly`,
    );
  }

  if (styleCategory) {
    suggestions.push(
      `Verify the ${styleCategory.count} changed stylesheet${styleCategory.count === 1 ? "" : "s"} don't break layout`,
    );
  }

  if (moduleCategory) {
    suggestions.push(
      `Check the ${moduleCategory.count} updated module${moduleCategory.count === 1 ? "" : "s"} work as expected`,
    );
  }

  if (totalWebFiles > 1) {
    suggestions.push(`Test the ${totalWebFiles} changed files work together end to end`);
  }

  if (suggestions.length === 0) {
    suggestions.push("Verify my recent changes work as expected");
  }

  suggestions.push("Check for regressions in related features");

  return suggestions;
};

export const getFlowSuggestionsFromContext = (
  contextType: ContextType | null,
  changedFiles: readonly ChangedFile[],
): readonly string[] => {
  if (!contextType) return DEFAULT_SUGGESTIONS;

  switch (contextType) {
    case "changes":
      return buildChangesSuggestions(changedFiles);
    case "pr":
      return PR_SUGGESTIONS;
    case "branch":
      return BRANCH_SUGGESTIONS;
    case "commit":
      return COMMIT_SUGGESTIONS;
    default:
      return DEFAULT_SUGGESTIONS;
  }
};
