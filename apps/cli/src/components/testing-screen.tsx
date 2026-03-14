import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { executeBrowserFlow, type BrowserRunEvent } from "@browser-tester/supervisor";
import {
  TESTING_TIMER_UPDATE_INTERVAL_MS,
  TESTING_TOOL_TEXT_CHAR_LIMIT,
  TESTING_VISIBLE_LOG_COUNT,
} from "../constants.js";
import { useColors, type Colors } from "./theme-context.js";
import { Spinner } from "./ui/spinner.js";
import { useAppStore } from "../store.js";
import { ScreenHeading } from "./ui/screen-heading.js";
import { truncateText } from "../utils/truncate-text.js";
import { formatElapsedTime } from "../utils/format-elapsed-time.js";
import {
  formatBrowserToolCall,
  formatBrowserToolResult,
} from "../utils/format-browser-tool-call.js";
import { extractScreenshotPath } from "../utils/extract-screenshot-path.js";
import { Image } from "./ui/image.js";
import { FileLink } from "./ui/file-link.js";
import { ErrorMessage } from "./ui/error-message.js";

interface TestingLine {
  text: string;
  color: string;
}

interface FormatRunEventOptions {
  traceDisplayMode: string;
}

const TOOL_CALL_DISPLAY_MODE_COMPACT = "compact";
const TOOL_CALL_DISPLAY_MODE_DETAILED = "detailed";
const TOOL_CALL_DISPLAY_MODE_HIDDEN = "hidden";

const getNextToolCallDisplayMode = (toolCallDisplayMode: string): string => {
  switch (toolCallDisplayMode) {
    case TOOL_CALL_DISPLAY_MODE_COMPACT:
      return TOOL_CALL_DISPLAY_MODE_DETAILED;
    case TOOL_CALL_DISPLAY_MODE_DETAILED:
      return TOOL_CALL_DISPLAY_MODE_HIDDEN;
    default:
      return TOOL_CALL_DISPLAY_MODE_COMPACT;
  }
};

const isDetailedTraceDisplayMode = (traceDisplayMode: string): boolean =>
  traceDisplayMode === TOOL_CALL_DISPLAY_MODE_DETAILED;

const isHiddenTraceDisplayMode = (traceDisplayMode: string): boolean =>
  traceDisplayMode === TOOL_CALL_DISPLAY_MODE_HIDDEN;

const formatRunEvent = (
  event: BrowserRunEvent,
  colors: Colors,
  options: FormatRunEventOptions,
): TestingLine | null => {
  switch (event.type) {
    case "run-started":
      return {
        text: `Starting ${event.planTitle}`,
        color: colors.PURPLE,
      };
    case "step-started":
      return {
        text: `${figures.arrowRight} ${event.stepId} ${event.title}`,
        color: colors.SELECTION,
      };
    case "step-completed":
      return {
        text: `${figures.tick} ${event.stepId} ${truncateText(event.summary, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.GREEN,
      };
    case "assertion-failed":
      return {
        text: `${figures.cross} ${event.stepId} ${truncateText(event.message, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.RED,
      };
    case "tool-call": {
      if (isHiddenTraceDisplayMode(options.traceDisplayMode)) return null;
      const toolCallText = formatBrowserToolCall(event.toolName, event.input, {
        includeRelevantInputs: isDetailedTraceDisplayMode(options.traceDisplayMode),
      });
      if (!toolCallText) return null;
      return {
        text: `• ${truncateText(toolCallText, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.DIM,
      };
    }
    case "tool-result": {
      if (isHiddenTraceDisplayMode(options.traceDisplayMode)) return null;
      const toolResultText = formatBrowserToolResult(event, {
        includeAllResults: isDetailedTraceDisplayMode(options.traceDisplayMode),
      });
      if (!toolResultText) return null;
      return {
        text: toolResultText,
        color: event.isError ? colors.RED : colors.DIM,
      };
    }
    case "text":
      if (!isDetailedTraceDisplayMode(options.traceDisplayMode)) return null;
      return {
        text: truncateText(event.text, TESTING_TOOL_TEXT_CHAR_LIMIT),
        color: colors.CYAN,
      };
    case "thinking":
      if (!isDetailedTraceDisplayMode(options.traceDisplayMode)) return null;
      return {
        text: `Thinking: ${truncateText(event.text, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.PURPLE,
      };
    case "browser-log":
      return null;
    case "error":
      return {
        text: `Error: ${truncateText(event.message, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.RED,
      };
    case "run-completed":
      return {
        text: `Run ${event.status}: ${truncateText(event.summary, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: event.status === "passed" ? colors.GREEN : colors.RED,
      };
    default:
      return null;
  }
};

export const TestingScreen = () => {
  const target = useAppStore((state) => state.resolvedTarget);
  const plan = useAppStore((state) => state.generatedPlan);
  const environment = useAppStore((state) => state.browserEnvironment);
  const exitTesting = useAppStore((state) => state.exitTesting);
  const COLORS = useColors();
  const colorsRef = useRef(COLORS);
  colorsRef.current = COLORS;
  const [events, setEvents] = useState<BrowserRunEvent[]>([]);
  const [statusLines, setStatusLines] = useState<TestingLine[]>([]);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [toolCallDisplayMode, setToolCallDisplayMode] = useState(TOOL_CALL_DISPLAY_MODE_COMPACT);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lines = useMemo(
    () => [
      ...events
        .map((event) => formatRunEvent(event, COLORS, { traceDisplayMode: toolCallDisplayMode }))
        .filter((line): line is TestingLine => line !== null),
      ...statusLines,
    ],
    [COLORS, events, statusLines, toolCallDisplayMode],
  );
  const visibleLines = useMemo(() => lines.slice(-TESTING_VISIBLE_LOG_COUNT), [lines]);
  const elapsedTimeLabel = useMemo(() => formatElapsedTime(elapsedTimeMs), [elapsedTimeMs]);

  useEffect(() => {
    if (!running || runStartedAt === null) return;

    setElapsedTimeMs(Date.now() - runStartedAt);

    const interval = setInterval(() => {
      setElapsedTimeMs(Date.now() - runStartedAt);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [runStartedAt, running]);

  useEffect(() => {
    if (!target || !plan || !environment) return;

    const abortController = new AbortController();
    const startedAt = Date.now();
    abortControllerRef.current = abortController;
    setEvents([]);
    setStatusLines([]);
    setRunning(true);
    setError(null);
    setVideoPath(null);
    setCurrentStep(null);
    setScreenshotPaths([]);
    setRunStartedAt(startedAt);
    setElapsedTimeMs(0);

    const run = async () => {
      try {
        for await (const event of executeBrowserFlow({
          target,
          plan,
          environment,
          signal: abortController.signal,
        })) {
          if (event.type === "run-completed") {
            setVideoPath(event.videoPath ?? null);
            setCurrentStep(null);
          }
          if (event.type === "step-started") {
            setCurrentStep(`${event.stepId} ${event.title}`);
          }
          if (event.type === "tool-result") {
            const screenshotPath = extractScreenshotPath(event);
            if (screenshotPath) {
              setScreenshotPaths((previous) => [...previous, screenshotPath]);
            }
          }
          setEvents((previous) => [...previous, event]);
          if (abortController.signal.aborted) {
            break;
          }
        }
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          setStatusLines((previous) => [
            ...previous,
            { text: "Cancelled.", color: colorsRef.current.YELLOW },
          ]);
        } else {
          const errorMessage = caughtError instanceof Error ? caughtError.message : "Unknown error";
          setError(errorMessage);
        }
      } finally {
        setRunning(false);
      }
    };

    run();

    return () => {
      abortController.abort();
    };
  }, [environment, plan, target]);

  useInput((input, key) => {
    if (input === "t") {
      setToolCallDisplayMode((previous) => getNextToolCallDisplayMode(previous));
      return;
    }

    if (key.escape) {
      abortControllerRef.current?.abort();
      exitTesting();
    }
  });

  if (!target || !plan || !environment) return null;

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <ScreenHeading
        title="Executing browser plan"
        subtitle={`${plan.title} · ${target.displayName}`}
      />

      <Box flexDirection="column" marginTop={1}>
        <Text color={currentStep ? COLORS.SELECTION : COLORS.DIM}>
          {currentStep ? `Current step: ${currentStep}` : "Waiting for first step..."}
        </Text>
        <Text color={COLORS.DIM}>
          Trace: {toolCallDisplayMode}. Press t to cycle compact, detailed, hidden.
        </Text>
      </Box>

      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="round"
        borderColor={COLORS.BORDER}
        paddingX={1}
      >
        {visibleLines.map((line, index) => (
          <Text key={`${index}-${line.text}`} color={line.color}>
            {line.text}
          </Text>
        ))}
        {visibleLines.length === 0 ? <Text color={COLORS.DIM}>No activity yet.</Text> : null}
      </Box>

      {running && (
        <Box marginTop={1}>
          <Spinner message={`Agent is working... ${elapsedTimeLabel}`} />
        </Box>
      )}

      {!running && !error && (
        <Box marginTop={1}>
          <Box flexDirection="column">
            <Text color={COLORS.GREEN} bold>
              Done
            </Text>
            {videoPath ? (
              <Text color={COLORS.DIM}>
                Video saved to <FileLink path={videoPath} />
              </Text>
            ) : null}
          </Box>
        </Box>
      )}

      {screenshotPaths.map((screenshotPath) => (
        <Image key={screenshotPath} src={screenshotPath} alt={`Screenshot: ${screenshotPath}`} />
      ))}

      <ErrorMessage message={error ? `Error: ${error}` : null} />

      <Box marginTop={1}>
        <Text color={COLORS.DIM}>
          Esc to {running ? "cancel" : "go back"} t to cycle trace
        </Text>
      </Box>
    </Box>
  );
};
