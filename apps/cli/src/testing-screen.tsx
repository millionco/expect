import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { BrowserRunEvent } from "@browser-tester/orchestrator";
import { TESTING_TOOL_TEXT_CHAR_LIMIT, TESTING_VISIBLE_LOG_COUNT } from "./constants.js";
import { useColors, type Colors } from "./theme-context.js";
import { Spinner } from "./spinner.js";
import { executeApprovedPlan } from "./utils/browser-agent.js";
import { useAppStore } from "./store.js";
import { truncateText } from "./utils/truncate-text.js";
import { formatBrowserToolCall, shouldShowToolResult } from "./utils/format-browser-tool-call.js";

interface TestingLine {
  text: string;
  color: string;
}

const formatRunEvent = (event: BrowserRunEvent, colors: Colors): TestingLine | null => {
  switch (event.type) {
    case "run-started":
      return {
        text: `Starting ${event.planTitle}`,
        color: colors.PURPLE,
      };
    case "step-started":
      return {
        text: `→ ${event.stepId} ${event.title}`,
        color: colors.SELECTION,
      };
    case "step-completed":
      return {
        text: `✓ ${event.stepId} ${truncateText(event.summary, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.GREEN,
      };
    case "assertion-failed":
      return {
        text: `✗ ${event.stepId} ${truncateText(event.message, TESTING_TOOL_TEXT_CHAR_LIMIT)}`,
        color: colors.RED,
      };
    case "tool-call": {
      const toolCallText = formatBrowserToolCall(event.toolName, event.input);
      if (!toolCallText) return null;
      return {
        text: `• ${toolCallText}`,
        color: colors.DIM,
      };
    }
    case "tool-result":
      if (!shouldShowToolResult(event)) return null;
      return {
        text: truncateText(event.result, TESTING_TOOL_TEXT_CHAR_LIMIT),
        color: event.isError ? colors.RED : colors.DIM,
      };
    case "browser-log":
    case "text":
    case "thinking":
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
  const [lines, setLines] = useState<TestingLine[]>([]);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const visibleLines = useMemo(() => lines.slice(-TESTING_VISIBLE_LOG_COUNT), [lines]);

  useEffect(() => {
    if (!target || !plan || !environment) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const run = async () => {
      try {
        for await (const event of executeApprovedPlan({
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
          const line = formatRunEvent(event, colorsRef.current);
          if (line) {
            setLines((previous) => [...previous, line]);
          }
          if (abortController.signal.aborted) {
            break;
          }
        }
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          setLines((previous) => [
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

  useInput((_input, key) => {
    if (key.escape) {
      abortControllerRef.current?.abort();
      exitTesting();
    }
  });

  if (!target || !plan || !environment) return null;

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
      <Text bold color={COLORS.TEXT}>
        Executing browser plan
      </Text>
      <Text color={COLORS.DIM}>{plan.title}</Text>
      <Text color={COLORS.DIM}>{target.displayName}</Text>

      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={COLORS.DIVIDER}
      />

      <Box flexDirection="column" marginTop={1}>
        <Text color={currentStep ? COLORS.SELECTION : COLORS.DIM}>
          {currentStep ? `Current step: ${currentStep}` : "Waiting for first step..."}
        </Text>
        <Text color={COLORS.DIM}>Browser actions are summarized below to reduce agent noise.</Text>
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
          <Spinner message="Agent is working..." />
        </Box>
      )}

      {!running && !error && (
        <Box marginTop={1}>
          <Box flexDirection="column">
            <Text color={COLORS.GREEN} bold>
              Done
            </Text>
            {videoPath ? <Text color={COLORS.DIM}>Video saved to {videoPath}</Text> : null}
          </Box>
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color={COLORS.RED}>Error: {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={COLORS.DIM}>Esc to {running ? "cancel" : "go back"}</Text>
      </Box>
    </Box>
  );
};
