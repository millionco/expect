import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { BrowserRunEvent } from "./events";

const PROVIDER_METADATA_KEY = "browser-tester-agent";

export interface ExecutionStreamState {
  bufferedText: string;
  sessionId?: string;
  stepTitlesById: Map<string, string>;
}

export interface ExecutionStreamContext {
  browserMcpServerName: string;
}

export interface ExecutionStreamParseResult {
  events: BrowserRunEvent[];
  nextState: ExecutionStreamState;
}

export const parseMarkerLine = (
  line: string,
  state: ExecutionStreamState,
): ExecutionStreamParseResult | null => {
  const [marker, stepId = "", rawMessage = ""] = line.split("|");

  if (marker === "STEP_START") {
    return {
      events: [
        {
          type: "step-started",
          timestamp: Date.now(),
          stepId,
          title: rawMessage || stepId,
        },
      ],
      nextState: {
        ...state,
        stepTitlesById: new Map(state.stepTitlesById).set(stepId, rawMessage || stepId),
      },
    };
  }

  if (marker === "STEP_DONE") {
    return {
      events: [
        {
          type: "step-completed",
          timestamp: Date.now(),
          stepId,
          summary: rawMessage,
        },
      ],
      nextState: state,
    };
  }

  if (marker === "ASSERTION_FAILED") {
    return {
      events: [
        {
          type: "assertion-failed",
          timestamp: Date.now(),
          stepId,
          message: rawMessage,
        },
      ],
      nextState: state,
    };
  }

  if (marker === "RUN_COMPLETED") {
    const status = stepId === "failed" ? "failed" : "passed";
    return {
      events: [
        {
          type: "run-completed",
          timestamp: Date.now(),
          status,
          summary: rawMessage,
        },
      ],
      nextState: state,
    };
  }

  if (!line.trim()) return null;

  return {
    events: [
      {
        type: "text",
        timestamp: Date.now(),
        text: line,
      },
    ],
    nextState: state,
  };
};

const MARKER_PATTERN = /(STEP_START|STEP_DONE|ASSERTION_FAILED|RUN_COMPLETED)\|/g;

const normalizeMarkerBoundaries = (text: string): string =>
  text.replace(MARKER_PATTERN, (match, _group, offset) => {
    if (offset === 0 || text[offset - 1] === "\n") return match;
    return `\n${match}`;
  });

export const parseTextDelta = (
  delta: string,
  state: ExecutionStreamState,
  _context: ExecutionStreamContext,
): ExecutionStreamParseResult => {
  const combinedText = normalizeMarkerBoundaries(`${state.bufferedText}${delta}`);
  const lines = combinedText.split("\n");
  const bufferedText = lines.pop() ?? "";
  const events: BrowserRunEvent[] = [];
  let nextState = state;

  for (const line of lines) {
    const markerEvent = parseMarkerLine(line.trim(), nextState);
    if (!markerEvent) continue;
    events.push(...markerEvent.events);
    nextState = markerEvent.nextState;
  }

  return {
    events,
    nextState: {
      ...nextState,
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
