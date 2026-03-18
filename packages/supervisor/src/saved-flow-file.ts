import { Schema } from "effect";
import type { BrowserEnvironmentHints, BrowserFlowPlan, TestTarget } from "./types";
import { SAVED_FLOW_FORMAT_VERSION } from "./constants";

export interface SavedFlowFileData {
  format_version: number;
  title: string;
  description: string;
  slug: string;
  saved_target_scope: TestTarget["scope"];
  saved_target_display_name: string;
  plan: BrowserFlowPlan;
  environment: BrowserEnvironmentHints;
}

const FLOW_FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;
const FRONTMATTER_LINE_PATTERN = /^([a-z][a-z0-9_]*):\s*(.+)$/gm;

const SavedFlowEnvironmentSchema = Schema.Struct({
  baseUrl: Schema.optional(Schema.NonEmptyString),
  headed: Schema.optional(Schema.Boolean),
  cookies: Schema.optional(Schema.Boolean),
});

const SavedFlowStepSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  instruction: Schema.NonEmptyString,
  expectedOutcome: Schema.NonEmptyString,
  routeHint: Schema.optional(Schema.NonEmptyString),
  changedFileEvidence: Schema.optional(Schema.Array(Schema.NonEmptyString)),
});

const SavedFlowPlanSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  rationale: Schema.NonEmptyString,
  targetSummary: Schema.NonEmptyString,
  userInstruction: Schema.NonEmptyString,
  assumptions: Schema.Array(Schema.NonEmptyString),
  riskAreas: Schema.Array(Schema.NonEmptyString),
  targetUrls: Schema.Array(Schema.NonEmptyString),
  cookieSync: Schema.Struct({
    required: Schema.Boolean,
    reason: Schema.NonEmptyString,
  }),
  steps: Schema.Array(SavedFlowStepSchema),
});

const SavedFlowFileSchema = Schema.Struct({
  format_version: Schema.Literals([SAVED_FLOW_FORMAT_VERSION] as const),
  title: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
  saved_target_scope: Schema.Literals(["unstaged", "branch", "changes", "commit"] as const),
  saved_target_display_name: Schema.NonEmptyString,
  plan: SavedFlowPlanSchema,
  environment: SavedFlowEnvironmentSchema,
});

export const formatSavedFlowFrontmatter = (savedFlowFileData: SavedFlowFileData): string =>
  [
    "---",
    `format_version: ${JSON.stringify(savedFlowFileData.format_version)}`,
    `title: ${JSON.stringify(savedFlowFileData.title)}`,
    `description: ${JSON.stringify(savedFlowFileData.description)}`,
    `slug: ${JSON.stringify(savedFlowFileData.slug)}`,
    `saved_target_scope: ${JSON.stringify(savedFlowFileData.saved_target_scope)}`,
    `saved_target_display_name: ${JSON.stringify(savedFlowFileData.saved_target_display_name)}`,
    `plan: ${JSON.stringify(savedFlowFileData.plan)}`,
    `environment: ${JSON.stringify(savedFlowFileData.environment)}`,
    "---",
  ].join("\n");

export const parseSavedFlowFile = (content: string): SavedFlowFileData | null => {
  const frontmatterMatch = content.match(FLOW_FRONTMATTER_PATTERN);
  if (!frontmatterMatch) return null;

  const frontmatterValues: Record<string, unknown> = {};

  for (const match of frontmatterMatch[1].matchAll(FRONTMATTER_LINE_PATTERN)) {
    const key = match[1];
    const rawValue = match[2];

    try {
      frontmatterValues[key] = JSON.parse(rawValue);
    } catch {
      return null;
    }
  }

  try {
    const decodedSavedFlowFile = Schema.decodeUnknownSync(SavedFlowFileSchema)(frontmatterValues);

    return {
      ...decodedSavedFlowFile,
      plan: {
        ...decodedSavedFlowFile.plan,
        assumptions: [...decodedSavedFlowFile.plan.assumptions],
        riskAreas: [...decodedSavedFlowFile.plan.riskAreas],
        targetUrls: [...decodedSavedFlowFile.plan.targetUrls],
        steps: decodedSavedFlowFile.plan.steps.map((step) => ({
          ...step,
          changedFileEvidence: [...(step.changedFileEvidence ?? [])],
        })),
      },
      environment: {
        ...decodedSavedFlowFile.environment,
      },
    };
  } catch {
    return null;
  }
};
