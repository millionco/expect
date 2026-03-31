import { describe, expect, it } from "vite-plus/test";
import {
  formatSavedFlowFile,
  formatSavedFlowFrontmatter,
  parseSavedFlowFile,
} from "../src/saved-flow-file";
import type { SavedFlowFileData } from "../src/types";

const savedFlowFileData: SavedFlowFileData = {
  formatVersion: 3,
  title: "Validate search user journey",
  description: "Validate the main production search journey.",
  slug: "validate-search-user-journey",
  savedTargetScope: "changes",
  savedTargetDisplayName: "changes on main",
  flow: {
    title: "Validate search user journey",
    userInstruction: "Validate the search experience on production.",
    steps: [
      {
        id: "step-01",
        title: "Open the search page",
        instruction: "Navigate to the search experience.",
        expectedOutcome: "The search UI is visible.",
      },
    ],
  },
  environment: {
    baseUrl: "https://example.com",
    cookies: true,
  },
};

describe("saved-flow-file", () => {
  it("omits optional selected commit from frontmatter when absent", () => {
    const frontmatter = formatSavedFlowFrontmatter(savedFlowFileData);

    expect(frontmatter).not.toContain("selected_commit: undefined");
  });

  it("round-trips a saved flow without selected commit", () => {
    const formattedFile = formatSavedFlowFile(savedFlowFileData);

    expect(parseSavedFlowFile(formattedFile)).toEqual(savedFlowFileData);
  });

  it("tolerates legacy undefined selected_commit values", () => {
    const formattedFile = formatSavedFlowFile(savedFlowFileData).replace(
      'flow: {"title":"Validate search user journey","userInstruction":"Validate the search experience on production.","steps":[{"id":"step-01","title":"Open the search page","instruction":"Navigate to the search experience.","expectedOutcome":"The search UI is visible."}]}',
      [
        "selected_commit: undefined",
        'flow: {"title":"Validate search user journey","userInstruction":"Validate the search experience on production.","steps":[{"id":"step-01","title":"Open the search page","instruction":"Navigate to the search experience.","expectedOutcome":"The search UI is visible."}]}',
      ].join("\n"),
    );

    expect(parseSavedFlowFile(formattedFile)).toEqual(savedFlowFileData);
  });

  it("defaults legacy flows without steps to an empty list", () => {
    const formattedFile = formatSavedFlowFile(savedFlowFileData).replace(
      `flow: ${JSON.stringify(savedFlowFileData.flow)}`,
      `flow: ${JSON.stringify({
        title: savedFlowFileData.flow.title,
        userInstruction: savedFlowFileData.flow.userInstruction,
      })}`,
    );

    expect(parseSavedFlowFile(formattedFile)).toEqual({
      ...savedFlowFileData,
      flow: {
        ...savedFlowFileData.flow,
        steps: [],
      },
    });
  });
});
