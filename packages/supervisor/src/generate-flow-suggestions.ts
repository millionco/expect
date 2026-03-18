import { Schema } from "effect";
import { CLAUDE_PLANNER_MODEL, CODEX_PLANNER_MODEL, DEFAULT_AGENT_PROVIDER } from "./constants";
import { ensureSafeCurrentWorkingDirectory } from "@browser-tester/utils";
import { createAgentModel } from "./create-agent-model";
import { extractJsonObject } from "./json";
import type { AgentProvider, ChangedFile } from "./types";

const SUGGESTION_COUNT = 3;
const SUGGESTION_MAX_FILES = 15;
const FlowSuggestionsSchema = Schema.Array(Schema.String);

interface GenerateFlowSuggestionsOptions {
  changedFiles: ChangedFile[];
  currentBranch: string;
  contextType: "changes" | "pr" | "branch" | "commit" | null;
  contextLabel: string | null;
  provider?: AgentProvider;
  signal?: AbortSignal;
}

const buildSuggestionsPrompt = (options: GenerateFlowSuggestionsOptions): string => {
  const lines: string[] = [
    `You are helping a developer decide what to test in the browser.`,
    `They are on branch "${options.currentBranch}".`,
  ];

  if (options.contextType && options.contextLabel) {
    const contextDescriptions: Record<string, string> = {
      changes: `Testing local changes on "${options.contextLabel}"`,
      pr: `Testing pull request "${options.contextLabel}"`,
      branch: `Testing branch "${options.contextLabel}"`,
      commit: `Testing commit ${options.contextLabel}`,
    };
    lines.push(contextDescriptions[options.contextType] ?? "");
  }

  if (options.changedFiles.length > 0) {
    const fileList = options.changedFiles
      .slice(0, SUGGESTION_MAX_FILES)
      .map((file) => `${file.status} ${file.path}`)
      .join("\n");
    lines.push("", "Changed files:", "", fileList);
  }

  lines.push(
    "",
    `Generate exactly ${SUGGESTION_COUNT} short, specific test suggestions based on the context above.`,
    `Each suggestion should be a single sentence, under 80 characters, describing a concrete thing to test in the browser.`,
    `Reference the actual functionality implied by the file paths, not the file names themselves.`,
    "",
    `Respond with a JSON array of ${SUGGESTION_COUNT} strings. Nothing else.`,
  );

  return lines.join("\n");
};

export const generateFlowSuggestions = async (
  options: GenerateFlowSuggestionsOptions,
): Promise<string[]> => {
  const provider = options.provider ?? DEFAULT_AGENT_PROVIDER;

  try {
    const model = createAgentModel(provider, {
      cwd: ensureSafeCurrentWorkingDirectory(),
      effort: "low",
      maxTurns: 1,
      ...(provider === "claude"
        ? { model: CLAUDE_PLANNER_MODEL }
        : provider === "codex"
          ? { model: CODEX_PLANNER_MODEL }
          : {}),
      permissionMode: "plan" as const,
      tools: [],
    });

    const response = await model.doGenerate({
      abortSignal: options.signal,
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: buildSuggestionsPrompt(options) }],
        },
      ],
    });

    const text = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    const parsedSuggestions = Schema.decodeUnknownSync(FlowSuggestionsSchema)(
      JSON.parse(extractJsonObject(text)),
    );

    return parsedSuggestions.slice(0, SUGGESTION_COUNT);
  } catch {
    return [];
  }
};
