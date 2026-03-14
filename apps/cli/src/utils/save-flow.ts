import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BrowserEnvironmentHints,
  BrowserFlowPlan,
  TestTarget,
} from "@browser-tester/orchestrator";
import {
  FLOW_DESCRIPTION_CHAR_LIMIT,
  FLOW_DIRECTORY_INDEX_FILE_NAME,
  FLOW_DIRECTORY_NAME,
} from "../constants.js";
import { slugify } from "./slugify.js";
import { truncateText } from "./truncate-text.js";

interface SaveFlowOptions {
  target: TestTarget;
  plan: BrowserFlowPlan;
  environment: BrowserEnvironmentHints;
}

export interface SaveFlowResult {
  flowPath: string;
  directoryPath: string;
  slug: string;
}

interface SavedFlowMetadata {
  title: string;
  description: string;
  slug: string;
}

const FLOW_FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;
const FRONTMATTER_LINE_PATTERN = /^([a-z]+):\s*(.+)$/gm;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ");

const createFlowDescription = (plan: BrowserFlowPlan): string =>
  truncateText(
    normalizeWhitespace(plan.targetSummary || plan.rationale || plan.userInstruction),
    FLOW_DESCRIPTION_CHAR_LIMIT,
  );

const formatOptionalList = (values: string[]): string =>
  values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None";

const formatFlowFileContent = (
  options: SaveFlowOptions,
  slug: string,
  description: string,
): string => {
  const { target, plan, environment } = options;

  const stepBlocks = plan.steps
    .map((step, index) =>
      [
        `### ${index + 1}. ${step.title}`,
        "",
        `Instruction: ${step.instruction}`,
        `Expected outcome: ${step.expectedOutcome}`,
        `Route hint: ${step.routeHint ?? "None"}`,
        `Changed file evidence: ${
          step.changedFileEvidence && step.changedFileEvidence.length > 0
            ? step.changedFileEvidence.join(", ")
            : "None"
        }`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "---",
    `title: ${JSON.stringify(plan.title)}`,
    `description: ${JSON.stringify(description)}`,
    `slug: ${JSON.stringify(slug)}`,
    "---",
    "",
    `# ${plan.title}`,
    "",
    description,
    "",
    "## User Instruction",
    "",
    plan.userInstruction,
    "",
    "## Target",
    "",
    `- Scope: ${target.scope}`,
    `- Display name: ${target.displayName}`,
    `- Current branch: ${target.branch.current}`,
    `- Main branch: ${target.branch.main ?? "unknown"}`,
    "",
    "## Cookie Sync",
    "",
    `- Required: ${plan.cookieSync.required ? "Yes" : "No"}`,
    `- Reason: ${plan.cookieSync.reason}`,
    `- Enabled for this saved flow: ${environment.cookies === true ? "Yes" : "No"}`,
    "",
    "## Target URLs",
    "",
    formatOptionalList(plan.targetUrls),
    "",
    "## Risk Areas",
    "",
    formatOptionalList(plan.riskAreas),
    "",
    "## Assumptions",
    "",
    formatOptionalList(plan.assumptions),
    "",
    "## Steps",
    "",
    stepBlocks,
    "",
  ].join("\n");
};

const parseSavedFlowMetadata = (content: string): SavedFlowMetadata | null => {
  const frontmatterMatch = content.match(FLOW_FRONTMATTER_PATTERN);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const metadata = new Map<string, string>();

  for (const match of frontmatter.matchAll(FRONTMATTER_LINE_PATTERN)) {
    const key = match[1];
    const rawValue = match[2];

    try {
      const parsedValue = JSON.parse(rawValue);
      if (typeof parsedValue === "string") {
        metadata.set(key, parsedValue);
      }
    } catch {
      return null;
    }
  }

  const title = metadata.get("title");
  const description = metadata.get("description");
  const slug = metadata.get("slug");

  if (!title || !description || !slug) return null;

  return { title, description, slug };
};

const formatDirectoryContent = (entries: SavedFlowMetadata[]): string =>
  [
    "# Saved Flows",
    "",
    ...(entries.length > 0
      ? entries.map((entry) => `- [${entry.title}](./${entry.slug}.md) - ${entry.description}`)
      : ["No saved flows yet."]),
    "",
  ].join("\n");

export const saveFlow = async (options: SaveFlowOptions): Promise<SaveFlowResult> => {
  const slug = slugify(options.plan.title);
  const description = createFlowDescription(options.plan);
  const flowDirectoryPath = join(options.target.cwd, FLOW_DIRECTORY_NAME);
  const flowFilePath = join(flowDirectoryPath, `${slug}.md`);
  const directoryFilePath = join(flowDirectoryPath, FLOW_DIRECTORY_INDEX_FILE_NAME);

  await mkdir(flowDirectoryPath, { recursive: true });
  await writeFile(flowFilePath, formatFlowFileContent(options, slug, description), "utf8");

  const flowFileNames = (await readdir(flowDirectoryPath))
    .filter((fileName) => fileName.endsWith(".md") && fileName !== FLOW_DIRECTORY_INDEX_FILE_NAME)
    .sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));

  const directoryEntries = (
    await Promise.all(
      flowFileNames.map(async (fileName) => {
        const filePath = join(flowDirectoryPath, fileName);
        const fileContent = await readFile(filePath, "utf8");
        return parseSavedFlowMetadata(fileContent);
      }),
    )
  )
    .filter((entry): entry is SavedFlowMetadata => entry !== null)
    .sort((leftValue, rightValue) => leftValue.title.localeCompare(rightValue.title));

  await writeFile(directoryFilePath, formatDirectoryContent(directoryEntries), "utf8");

  return {
    flowPath: join(FLOW_DIRECTORY_NAME, `${slug}.md`),
    directoryPath: join(FLOW_DIRECTORY_NAME, FLOW_DIRECTORY_INDEX_FILE_NAME),
    slug,
  };
};
