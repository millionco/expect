import { Predicate } from "effect";
import type { SavedFlowFileData } from "./types";

const formatSavedFlowFrontmatter = (data: SavedFlowFileData): string => {
  const lines: string[] = [
    `format_version: ${data.formatVersion}`,
    `title: ${JSON.stringify(data.title)}`,
    `description: ${JSON.stringify(data.description)}`,
    `slug: ${JSON.stringify(data.slug)}`,
    `saved_target_scope: ${JSON.stringify(data.savedTargetScope)}`,
    `saved_target_display_name: ${JSON.stringify(data.savedTargetDisplayName)}`,
  ];

  if (data.selectedCommit !== undefined) {
    lines.push(`selected_commit: ${JSON.stringify(data.selectedCommit)}`);
  }

  lines.push(`flow: ${JSON.stringify(data.flow)}`);
  lines.push(`environment: ${JSON.stringify(data.environment)}`);

  return lines.join("\n");
};

export const formatSavedFlowFile = (data: SavedFlowFileData): string =>
  `---\n${formatSavedFlowFrontmatter(data)}\n---\n`;

const parseStringValue = (value: string): string => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }
  return value;
};

const isSavedFlowStep = (value: unknown): value is SavedFlowFileData["flow"]["steps"][number] =>
  Predicate.isObject(value) &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  typeof value.instruction === "string" &&
  typeof value.expectedOutcome === "string";

const normalizeSavedFlow = (value: unknown): SavedFlowFileData["flow"] => {
  if (!Predicate.isObject(value)) {
    return {
      title: "",
      userInstruction: "",
      steps: [],
    };
  }

  return {
    title: typeof value.title === "string" ? value.title : "",
    userInstruction: typeof value.userInstruction === "string" ? value.userInstruction : "",
    steps: Array.isArray(value.steps) ? value.steps.filter(isSavedFlowStep) : [],
  };
};

const normalizeSavedFlowEnvironment = (value: unknown): SavedFlowFileData["environment"] => {
  if (!Predicate.isObject(value)) {
    return {
      baseUrl: "",
      cookies: false,
    };
  }

  return {
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
    cookies: typeof value.cookies === "boolean" ? value.cookies : false,
  };
};

export const parseSavedFlowFile = (content: string): SavedFlowFileData => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) throw new Error("Invalid saved flow file: no frontmatter found");

  const frontmatter = frontmatterMatch[1];
  const fields = new Map<string, string>();

  for (const line of frontmatter.split("\n")) {
    if (line === "selected_commit: undefined") continue;

    const colonIndex = line.indexOf(": ");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 2);
    fields.set(key, value);
  }

  const result: SavedFlowFileData = {
    formatVersion: Number(fields.get("format_version")),
    title: parseStringValue(fields.get("title") ?? ""),
    description: parseStringValue(fields.get("description") ?? ""),
    slug: parseStringValue(fields.get("slug") ?? ""),
    savedTargetScope: parseStringValue(fields.get("saved_target_scope") ?? ""),
    savedTargetDisplayName: parseStringValue(fields.get("saved_target_display_name") ?? ""),
    flow: normalizeSavedFlow(JSON.parse(fields.get("flow") ?? "{}")),
    environment: normalizeSavedFlowEnvironment(JSON.parse(fields.get("environment") ?? "{}")),
  };

  const selectedCommit = fields.get("selected_commit");
  if (selectedCommit !== undefined) {
    result.selectedCommit = parseStringValue(selectedCommit);
  }

  return result;
};
