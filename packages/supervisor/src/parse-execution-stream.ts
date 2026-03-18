import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { BrowserRunEvent } from "./events";
import type { PlanStep } from "./types";

const PROVIDER_METADATA_KEY = "browser-tester-agent";

export interface ExecutionStreamState {
  bufferedText: string;
  sessionId?: string;
}

export interface ExecutionStreamContext {
  browserMcpServerName: string;
  stepsById: Map<string, PlanStep>;
}

export interface ExecutionStreamParseResult {
  events: BrowserRunEvent[];
  nextState: ExecutionStreamState;
}

export const buildStepMap = (steps: PlanStep[]): Map<string, PlanStep> =>
  new Map(steps.map((step) => [step.id, step]));

export const parseMarkerLine = (
  line: string,
  context: ExecutionStreamContext,
): BrowserRunEvent | BrowserRunEvent[] | null => {
  const [marker, stepId = "", rawMessage = ""] = line.split("|");

  if (marker === "STEP_START") {
    const step = context.stepsById.get(stepId);
    return {
      type: "step-started",
      timestamp: Date.now(),
      stepId,
      title: rawMessage || step?.title || stepId,
    };
  }

  if (marker === "STEP_DONE") {
    return {
      type: "step-completed",
      timestamp: Date.now(),
      stepId,
      summary: rawMessage,
    };
  }

  if (marker === "ASSERTION_FAILED") {
    return {
      type: "assertion-failed",
      timestamp: Date.now(),
      stepId,
      message: rawMessage,
    };
  }

  if (marker === "RUN_COMPLETED") {
    const status = stepId === "failed" ? "failed" : "passed";
    return {
      type: "run-completed",
      timestamp: Date.now(),
      status,
      summary: rawMessage,
    };
  }

  if (!line.trim()) return null;

  return {
    type: "text",
    timestamp: Date.now(),
    text: line,
  };
};

export const parseTextDelta = (
  delta: string,
  state: ExecutionStreamState,
  context: ExecutionStreamContext,
): ExecutionStreamParseResult => {
  const combinedText = `${state.bufferedText}${delta}`;
  const lines = combinedText.split("\n");
  const bufferedText = lines.pop() ?? "";
  const events: BrowserRunEvent[] = [];

  for (const line of lines) {
    const markerEvent = parseMarkerLine(line.trim(), context);
    if (!markerEvent) continue;
    if (Array.isArray(markerEvent)) events.push(...markerEvent);
    else events.push(markerEvent);
  }

  return {
    events,
    nextState: {
      ...state,
      bufferedText,
    },
  };
};

export const parseBrowserToolName = (
  toolName: string,
  browserMcpServerName: string,
): string | null => {
  const prefix = `mcp__${browserMcpServerName}__`;
  if (!toolName.startsWith(prefix)) return null;
  return toolName.slice(prefix.length);
};

export const extractStreamSessionId = (part: LanguageModelV3StreamPart): string | undefined => {
  if (part.type !== "finish") return undefined;
  const providerMetadata = part.providerMetadata?.[PROVIDER_METADATA_KEY];
  if (!providerMetadata || typeof providerMetadata !== "object") return undefined;
  const sessionId = Reflect.get(providerMetadata, "sessionId");
  return typeof sessionId === "string" ? sessionId : undefined;
};
