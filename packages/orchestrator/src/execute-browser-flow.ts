import { accessSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { createClaudeModel } from "@browser-tester/agent";
import { BROWSER_TEST_MODEL, DEFAULT_BROWSER_MCP_SERVER_NAME } from "./constants.js";
import { buildBrowserMcpSettings } from "./browser-mcp-config.js";
import type {
  BrowserRunEvent,
  ExecuteBrowserFlowOptions,
  ExecutionStreamContext,
  ExecutionStreamParseResult,
  ExecutionStreamState,
  PlanStep,
} from "./types.js";

const PROVIDER_METADATA_KEY = "browser-tester-agent";
const VIDEO_DIRECTORY_PREFIX = "browser-tester-run-";
const VIDEO_FILE_NAME = "browser-flow.webm";

const createExecutionModel = (
  options: Pick<
    ExecuteBrowserFlowOptions,
    "model" | "providerSettings" | "target" | "browserMcpServerName" | "videoOutputPath"
  >,
): LanguageModelV3 =>
  options.model ??
  createClaudeModel(
    buildBrowserMcpSettings({
      providerSettings: {
        cwd: options.target.cwd,
        model: BROWSER_TEST_MODEL,
        ...(options.providerSettings ?? {}),
      },
      browserMcpServerName: options.browserMcpServerName,
      videoOutputPath: options.videoOutputPath,
    }),
  );

const formatPlanSteps = (steps: PlanStep[]): string =>
  steps
    .map((step) =>
      [
        `- ${step.id}: ${step.title}`,
        `  instruction: ${step.instruction}`,
        `  expected outcome: ${step.expectedOutcome}`,
        `  route hint: ${step.routeHint ?? "none"}`,
        `  changed file evidence: ${
          step.changedFileEvidence && step.changedFileEvidence.length > 0
            ? step.changedFileEvidence.join(", ")
            : "none"
        }`,
      ].join("\n"),
    )
    .join("\n");

const buildExecutionPrompt = (options: ExecuteBrowserFlowOptions): string => {
  const { plan, target, environment, browserMcpServerName, videoOutputPath } = options;

  return [
    "You are executing an approved browser test plan.",
    `You have access to browser tools through the MCP server named "${browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME}".`,
    "Follow the approved steps in order. You may adapt to UI details, but do not invent a different goal.",
    "If a step is blocked, explain why and emit the failure marker.",
    "A browser video recording is enabled for this run.",
    "",
    "Before and after each step, emit these exact status lines on their own lines:",
    "STEP_START|<step-id>|<step-title>",
    "STEP_DONE|<step-id>|<short-summary>",
    "ASSERTION_FAILED|<step-id>|<why-it-failed>",
    "RUN_COMPLETED|passed|<final-summary>",
    "RUN_COMPLETED|failed|<final-summary>",
    "",
    "Before emitting RUN_COMPLETED, call the close tool exactly once so the browser session flushes the video to disk.",
    "Use the browser tools to open pages, inspect the accessibility tree, interact with the UI, wait when needed, and check browser logs or network requests when helpful.",
    "When this run launches its own browser, the close tool should shut that browser down cleanly.",
    "",
    "Environment:",
    `- Base URL: ${environment?.baseUrl ?? "not provided"}`,
    `- Headed mode preference: ${environment?.headed === true ? "headed" : "headless or not specified"}`,
    `- Reuse browser cookies: ${environment?.cookies === true ? "yes" : "no or not specified"}`,
    `- Video output path: ${videoOutputPath ?? "not configured"}`,
    "",
    "Testing target context:",
    `- Scope: ${target.scope}`,
    `- Display name: ${target.displayName}`,
    `- Current branch: ${target.branch.current}`,
    `- Main branch: ${target.branch.main ?? "unknown"}`,
    "",
    "Approved plan:",
    `Title: ${plan.title}`,
    `Rationale: ${plan.rationale}`,
    `Target summary: ${plan.targetSummary}`,
    `User instruction: ${plan.userInstruction}`,
    `Assumptions: ${plan.assumptions.length > 0 ? plan.assumptions.join("; ") : "none"}`,
    `Risk areas: ${plan.riskAreas.length > 0 ? plan.riskAreas.join("; ") : "none"}`,
    `Target URLs: ${plan.targetUrls.length > 0 ? plan.targetUrls.join(", ") : "none"}`,
    "",
    formatPlanSteps(plan.steps),
  ].join("\n");
};

const createTimestamp = (): number => Date.now();

const createVideoOutputPath = (): string => {
  const videoDirectory = mkdtempSync(join(tmpdir(), VIDEO_DIRECTORY_PREFIX));
  return join(videoDirectory, VIDEO_FILE_NAME);
};

const resolveVideoPath = (videoOutputPath: string | undefined): string | undefined => {
  if (!videoOutputPath) return undefined;

  try {
    accessSync(videoOutputPath);
    return videoOutputPath;
  } catch {
    return videoOutputPath;
  }
};

const buildStepMap = (steps: PlanStep[]): Map<string, PlanStep> =>
  new Map(steps.map((step) => [step.id, step]));

const parseMarkerLine = (
  line: string,
  context: ExecutionStreamContext,
): BrowserRunEvent | BrowserRunEvent[] | null => {
  const [marker, stepId = "", rawMessage = ""] = line.split("|");

  if (marker === "STEP_START") {
    const step = context.stepsById.get(stepId);
    return {
      type: "step-started",
      timestamp: createTimestamp(),
      stepId,
      title: rawMessage || step?.title || stepId,
    };
  }

  if (marker === "STEP_DONE") {
    return {
      type: "step-completed",
      timestamp: createTimestamp(),
      stepId,
      summary: rawMessage,
    };
  }

  if (marker === "ASSERTION_FAILED") {
    return {
      type: "assertion-failed",
      timestamp: createTimestamp(),
      stepId,
      message: rawMessage,
    };
  }

  if (marker === "RUN_COMPLETED") {
    const status = stepId === "failed" ? "failed" : "passed";
    return {
      type: "run-completed",
      timestamp: createTimestamp(),
      status,
      summary: rawMessage,
    };
  }

  if (!line.trim()) return null;

  return {
    type: "text",
    timestamp: createTimestamp(),
    text: line,
  };
};

const parseTextDelta = (
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

const parseToolName = (toolName: string, browserMcpServerName: string): string | null => {
  const prefix = `mcp__${browserMcpServerName}__`;
  if (!toolName.startsWith(prefix)) return null;
  return toolName.slice(prefix.length);
};

const extractSessionId = (part: LanguageModelV3StreamPart): string | undefined => {
  if (part.type !== "finish") return undefined;
  const providerMetadata = part.providerMetadata?.[PROVIDER_METADATA_KEY];
  if (!providerMetadata || typeof providerMetadata !== "object") return undefined;
  const sessionId = Reflect.get(providerMetadata, "sessionId");
  return typeof sessionId === "string" ? sessionId : undefined;
};

export const executeBrowserFlow = async function* (
  options: ExecuteBrowserFlowOptions,
): AsyncGenerator<BrowserRunEvent> {
  const browserMcpServerName = options.browserMcpServerName ?? DEFAULT_BROWSER_MCP_SERVER_NAME;
  const videoOutputPath = options.videoOutputPath ?? createVideoOutputPath();
  const model = createExecutionModel({
    model: options.model,
    providerSettings: options.providerSettings,
    target: options.target,
    browserMcpServerName,
    videoOutputPath,
  });
  const prompt = buildExecutionPrompt({
    ...options,
    browserMcpServerName,
    videoOutputPath,
  });

  yield {
    type: "run-started",
    timestamp: createTimestamp(),
    planTitle: options.plan.title,
  };

  const streamResult = await model.doStream({
    abortSignal: options.signal,
    prompt: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  });

  const reader = streamResult.stream.getReader();
  let streamState: ExecutionStreamState = { bufferedText: "" };
  let completedEventEmitted = false;
  const streamContext: ExecutionStreamContext = {
    browserMcpServerName,
    stepsById: buildStepMap(options.plan.steps),
  };

  for (;;) {
    const nextChunk = await reader.read();
    if (nextChunk.done) break;

    const part = nextChunk.value;

    if (part.type === "text-delta") {
      const parsedText = parseTextDelta(part.delta, streamState, streamContext);
      streamState = parsedText.nextState;
      for (const event of parsedText.events) {
        if (event.type === "run-completed") {
          completedEventEmitted = true;
          yield {
            ...event,
            sessionId: streamState.sessionId,
            videoPath: resolveVideoPath(videoOutputPath),
          };
        } else {
          yield event;
        }
      }
      continue;
    }

    if (part.type === "reasoning-delta") {
      yield {
        type: "thinking",
        timestamp: createTimestamp(),
        text: part.delta,
      };
      continue;
    }

    if (part.type === "tool-call") {
      yield {
        type: "tool-call",
        timestamp: createTimestamp(),
        toolName: part.toolName,
        input: part.input,
      };

      const browserAction = parseToolName(part.toolName, browserMcpServerName);
      if (browserAction) {
        yield {
          type: "browser-log",
          timestamp: createTimestamp(),
          action: browserAction,
          message: `Called ${browserAction}`,
        };
      }
      continue;
    }

    if (part.type === "tool-result") {
      const result = String(part.result);
      const browserAction = parseToolName(part.toolName, browserMcpServerName);

      yield {
        type: "tool-result",
        timestamp: createTimestamp(),
        toolName: part.toolName,
        result,
        isError: Boolean(part.isError),
      };

      if (browserAction) {
        yield {
          type: "browser-log",
          timestamp: createTimestamp(),
          action: browserAction,
          message: result,
        };
      }
      continue;
    }

    const sessionId = extractSessionId(part);
    if (sessionId) {
      streamState = {
        ...streamState,
        sessionId,
      };
    }
  }

  if (streamState.bufferedText.trim()) {
    const trailingEvent = parseMarkerLine(streamState.bufferedText.trim(), streamContext);
    if (trailingEvent) {
      if (Array.isArray(trailingEvent)) {
        for (const event of trailingEvent) yield event;
      } else {
        if (trailingEvent.type === "run-completed") {
          completedEventEmitted = true;
          yield {
            ...trailingEvent,
            sessionId: streamState.sessionId,
            videoPath: resolveVideoPath(videoOutputPath),
          };
          return;
        }
        yield trailingEvent;
      }
    }
  }

  if (completedEventEmitted) return;

  yield {
    type: "run-completed",
    timestamp: createTimestamp(),
    status: "passed",
    summary: "Run completed.",
    sessionId: streamState.sessionId,
    videoPath: resolveVideoPath(videoOutputPath),
  };
};
