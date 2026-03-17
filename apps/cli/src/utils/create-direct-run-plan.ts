import type { BrowserFlowPlan, TestTarget } from "@browser-tester/supervisor";
import { DIRECT_RUN_CHANGED_FILE_LIMIT, DIRECT_RUN_TITLE_CHAR_LIMIT } from "../constants.js";

interface CreateDirectRunPlanOptions {
  userInstruction: string;
  target: TestTarget;
}

const truncateTitle = (instruction: string): string => {
  if (instruction.length <= DIRECT_RUN_TITLE_CHAR_LIMIT) {
    return `Direct run: ${instruction}`;
  }

  return `Direct run: ${instruction.slice(0, DIRECT_RUN_TITLE_CHAR_LIMIT).trimEnd()}...`;
};

const getChangedFileEvidence = (target: TestTarget): string[] =>
  target.changedFiles
    .slice(0, DIRECT_RUN_CHANGED_FILE_LIMIT)
    .map((changedFile) => changedFile.path);

export const createDirectRunPlan = ({
  userInstruction,
  target,
}: CreateDirectRunPlanOptions): BrowserFlowPlan => {
  const changedFileEvidence = getChangedFileEvidence(target);

  return {
    title: truncateTitle(userInstruction),
    rationale: `Run the requested browser test directly against ${target.displayName} without a separate planning pass.`,
    targetSummary: `Validate ${target.displayName} with the user's requested browser flow.`,
    userInstruction,
    assumptions: [],
    riskAreas: changedFileEvidence,
    targetUrls: [],
    cookieSync: {
      required: false,
      reason: "Direct runs do not require authenticated state by default.",
    },
    steps: [
      {
        id: "step-1",
        title: "Run requested browser test",
        instruction: `Use the browser to carry out this instruction: ${userInstruction}`,
        expectedOutcome:
          "The requested browser flow works as described, or any blocker is captured with evidence.",
        changedFileEvidence,
      },
    ],
  };
};
