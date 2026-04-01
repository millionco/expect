import { useEffect, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { Cause, DateTime, Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import * as Atom from "effect/unstable/reactivity/Atom";
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";

import {
  type ChangesFor,
  type SavedFlow,
  TestPlanStep,
  type ExecutedTestPlan,
  type ExecutionEvent,
} from "@expect/shared/models";
import { TESTING_TIMER_UPDATE_INTERVAL_MS, TESTING_TOOL_TEXT_CHAR_LIMIT } from "../../constants";
import { useColors, theme } from "../theme-context";
import InkSpinner from "ink-spinner";
import { Spinner } from "../ui/spinner";
import { TextShimmer } from "../ui/text-shimmer";
import { Logo } from "../ui/logo";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time";
import { Image } from "../ui/image";
import { ErrorMessage } from "../ui/error-message";
import { executeFn, screenshotPathsAtom } from "../../data/execution-atom";
import { agentConfigOptionsAtom } from "../../data/config-options";
import { agentProviderAtom } from "../../data/runtime";
import { trackEvent } from "../../utils/session-analytics";
import { formatToolCall, type FormattedToolCall } from "../../utils/format-tool-call";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";

import type { DevServerHint } from "../../stores/use-navigation";

interface TestingScreenProps {
  changesFor: ChangesFor;
  instruction: string;
  savedFlow?: SavedFlow;
  cookieBrowserKeys?: readonly string[];
  baseUrls?: readonly string[];
  devServerHints?: readonly DevServerHint[];
}

interface ToolCallDisplay {
  tool: FormattedToolCall;
  isRunning: boolean;
  resultTokens: number | undefined;
}

const MAX_VISIBLE_TOOL_CALLS = 5;
const APPROX_CHARS_PER_TOKEN = 4;
const EXPANDED_VIEWPORT_OVERHEAD = 6;

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
};

const collectToolCalls = (
  events: readonly ExecutionEvent[],
  fromIndex: number,
  toIndex: number = events.length,
): ToolCallDisplay[] => {
  const calls: ToolCallDisplay[] = [];

  for (let index = fromIndex; index < toIndex; index++) {
    const event = events[index];
    if (event._tag === "ToolCall") {
      calls.push({
        tool: formatToolCall(event.toolName, event.input),
        isRunning: false,
        resultTokens: undefined,
      });
    }
    if (event._tag === "ToolProgress" && calls.length > 0) {
      const lastCall = calls[calls.length - 1];
      calls[calls.length - 1] = {
        ...lastCall,
        resultTokens: Math.round(event.outputSize / APPROX_CHARS_PER_TOKEN),
      };
    }
    if (event._tag === "ToolResult" && calls.length > 0) {
      const lastCall = calls[calls.length - 1];
      calls[calls.length - 1] = {
        ...lastCall,
        resultTokens: Math.round(event.result.length / APPROX_CHARS_PER_TOKEN),
      };
    }
  }

  return calls;
};

const markLastCallRunning = (
  calls: ToolCallDisplay[],
  events: readonly ExecutionEvent[],
): ToolCallDisplay[] => {
  if (calls.length === 0) return calls;
  const lastEvent = events.at(-1);
  const isLastDone = lastEvent?._tag === "ToolResult";
  const result = [...calls];
  result[result.length - 1] = {
    ...result[result.length - 1],
    isRunning: !isLastDone,
  };
  return result;
};

const getActiveStepToolCalls = (
  events: readonly ExecutionEvent[],
  showAll = false,
): ToolCallDisplay[] => {
  let lastStepStartIndex = -1;
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]._tag === "StepStarted") {
      lastStepStartIndex = index;
      break;
    }
  }
  if (lastStepStartIndex === -1) return [];
  const calls = collectToolCalls(events, lastStepStartIndex + 1);
  const marked = markLastCallRunning(calls, events);
  return showAll ? marked : marked.slice(-MAX_VISIBLE_TOOL_CALLS);
};

const getPlanningToolCalls = (
  events: readonly ExecutionEvent[],
  showAll = false,
): ToolCallDisplay[] => {
  const calls = collectToolCalls(events, 0);
  const marked = markLastCallRunning(calls, events);
  return showAll ? marked : marked.slice(-MAX_VISIBLE_TOOL_CALLS);
};

const findStepEventRange = (
  events: readonly ExecutionEvent[],
  stepIndex: number,
): [number, number] => {
  let currentStep = -1;
  let startIndex = 0;

  for (let index = 0; index < events.length; index++) {
    if (events[index]._tag === "StepStarted") {
      currentStep++;
      if (currentStep === stepIndex) startIndex = index + 1;
      if (currentStep === stepIndex + 1) return [startIndex, index];
    }
  }

  return [startIndex, events.length];
};

const getCompletedStepToolCalls = (
  events: readonly ExecutionEvent[],
  stepIndex: number,
): ToolCallDisplay[] => {
  const [from, to] = findStepEventRange(events, stepIndex);
  return collectToolCalls(events, from, to);
};

const ToolCallBlock = ({
  display,
  indent,
}: {
  readonly display: ToolCallDisplay;
  readonly indent: string;
}) => {
  const COLORS = useColors();
  return (
    <Text color={COLORS.DIM} wrap="truncate">
      {indent}
      {figures.lineVertical} <Text color={COLORS.TEXT}>{display.tool.name}</Text>(
      {display.tool.args})
      {display.isRunning && (
        <Text>
          {" "}
          <InkSpinner type="line" />
        </Text>
      )}
      {display.resultTokens !== undefined &&
        ` ${figures.arrowDown} ${formatTokenCount(display.resultTokens)} tokens`}
    </Text>
  );
};

const getStepElapsedMs = (step: TestPlanStep): number | undefined => {
  if (Option.isNone(step.startedAt)) return undefined;
  const endMs = Option.isSome(step.endedAt)
    ? DateTime.toEpochMillis(step.endedAt.value)
    : Date.now();
  return endMs - DateTime.toEpochMillis(step.startedAt.value);
};

const buildToolCallRows = (
  toolCalls: ToolCallDisplay[],
  indent: string,
  keyPrefix: string,
  colors: ReturnType<typeof useColors>,
): React.ReactElement[] => {
  const rows: React.ReactElement[] = [];
  for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex++) {
    const display = toolCalls[toolIndex];
    const baseKey = `${keyPrefix}-t${toolIndex}`;

    if (display.tool.multilineArgs) {
      const lines = display.tool.multilineArgs.split("\n");
      rows.push(
        <Text key={`${baseKey}-h`} color={colors.DIM} wrap="truncate">
          {indent}
          {figures.lineVertical} <Text color={colors.TEXT}>{display.tool.name}</Text>(
          {display.isRunning && (
            <Text>
              {" "}
              <InkSpinner type="line" />
            </Text>
          )}
          {display.resultTokens !== undefined &&
            ` ${figures.arrowDown} ${formatTokenCount(display.resultTokens)} tokens`}
        </Text>,
      );
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        rows.push(
          <Text key={`${baseKey}-${lineIndex}`} color={colors.DIM}>
            {indent}
            {figures.lineVertical} {"  "}
            <Text color={colors.TEXT}>{lines[lineIndex]}</Text>
          </Text>,
        );
      }
      rows.push(
        <Text key={`${baseKey}-c`} color={colors.DIM}>
          {indent}
          {figures.lineVertical} )
        </Text>,
      );
    } else {
      rows.push(
        <Text key={baseKey} color={colors.DIM} wrap="truncate">
          {indent}
          {figures.lineVertical} <Text color={colors.TEXT}>{display.tool.name}</Text>(
          {display.tool.args})
          {display.isRunning && (
            <Text>
              {" "}
              <InkSpinner type="line" />
            </Text>
          )}
          {display.resultTokens !== undefined &&
            ` ${figures.arrowDown} ${formatTokenCount(display.resultTokens)} tokens`}
        </Text>,
      );
    }
  }
  return rows;
};

export const TestingScreen = ({
  changesFor,
  instruction,
  savedFlow,
  cookieBrowserKeys = [],
  baseUrls,
  devServerHints,
}: TestingScreenProps) => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();
  const [, terminalRows] = useStdoutDimensions();

  const agentProviderValue = useAtomValue(agentProviderAtom);
  const agentBackend = Option.isSome(agentProviderValue) ? agentProviderValue.value : "claude";
  const setConfigOptions = useAtomSet(agentConfigOptionsAtom);
  const modelPreferenceConfigId = usePreferencesStore(
    (state) => state.modelPreferences[agentBackend]?.configId,
  );
  const modelPreferenceValue = usePreferencesStore(
    (state) => state.modelPreferences[agentBackend]?.value,
  );
  const browserHeaded = usePreferencesStore((state) => state.browserHeaded);
  const replayHost = usePreferencesStore((state) => state.replayHost);
  const toggleNotifications = usePreferencesStore((state) => state.toggleNotifications);
  const [executionResult, triggerExecute] = useAtom(executeFn, {
    mode: "promiseExit",
  });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);
  const [liveReplayUrl, setLiveReplayUrl] = useState<string | undefined>(undefined);

  const isExecuting = AsyncResult.isWaiting(executionResult);
  const isExecutionComplete = AsyncResult.isSuccess(executionResult);
  const report = isExecutionComplete ? executionResult.value.report : undefined;

  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(undefined);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const expanded = usePlanExecutionStore((state) => state.expanded);
  const setExpanded = usePlanExecutionStore((state) => state.setExpanded);
  const toggleExpanded = usePlanExecutionStore((state) => state.toggleExpanded);

  const elapsedTimeLabel = formatElapsedTime(elapsedTimeMs);
  const totalCount = executedPlan?.steps ? executedPlan.steps.length : 0;

  // Build flat rows for expanded scrollable view
  const expandedRows: React.ReactElement[] = [];
  if (expanded && executedPlan) {
    const steps = executedPlan.steps ?? [];

    if (steps.length === 0 && isExecuting) {
      const toolCalls = getPlanningToolCalls(executedPlan.events, true);
      expandedRows.push(...buildToolCallRows(toolCalls, "  ", "planning", COLORS));
    }

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      const label = Option.isSome(step.summary) ? step.summary.value : step.title;
      const stepElapsedMs = getStepElapsedMs(step);
      const stepElapsedLabel =
        stepElapsedMs !== undefined ? formatElapsedTime(stepElapsedMs) : undefined;
      const num = `${stepIndex + 1}.`;

      if (step.status === "active") {
        expandedRows.push(
          <Box key={`step-${stepIndex}`}>
            <Text color={COLORS.DIM}>
              {"  "}
              {num}{" "}
            </Text>
            <Spinner />
            <Text> </Text>
            <TextShimmer
              text={`${step.title} ${elapsedTimeLabel}`}
              baseColor={theme.shimmerBase}
              highlightColor={theme.shimmerHighlight}
            />
          </Box>,
        );
        const toolCalls = getActiveStepToolCalls(executedPlan.events, true);
        expandedRows.push(...buildToolCallRows(toolCalls, "     ", `s${stepIndex}`, COLORS));
      } else if (step.status === "passed") {
        expandedRows.push(
          <Text key={`step-${stepIndex}`}>
            <Text color={COLORS.DIM}>
              {"  "}
              {num}
            </Text>
            <Text color={COLORS.GREEN}>
              {" "}
              {figures.tick} {cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}
            </Text>
            {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
          </Text>,
        );
        const toolCalls = getCompletedStepToolCalls(executedPlan.events, stepIndex);
        expandedRows.push(...buildToolCallRows(toolCalls, "     ", `s${stepIndex}`, COLORS));
      } else if (step.status === "failed") {
        expandedRows.push(
          <Text key={`step-${stepIndex}`}>
            <Text color={COLORS.DIM}>
              {"  "}
              {num}
            </Text>
            <Text color={COLORS.RED}>
              {" "}
              {figures.cross} {cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}
            </Text>
            {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
          </Text>,
        );
        const toolCalls = getCompletedStepToolCalls(executedPlan.events, stepIndex);
        expandedRows.push(...buildToolCallRows(toolCalls, "     ", `s${stepIndex}`, COLORS));
      } else if (step.status === "skipped") {
        expandedRows.push(
          <Text key={`step-${stepIndex}`}>
            <Text color={COLORS.DIM}>
              {"  "}
              {num}
            </Text>
            <Text color={COLORS.YELLOW}>
              {" "}
              {figures.arrowRight} {cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}
            </Text>
            {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
          </Text>,
        );
      } else {
        expandedRows.push(
          <Text key={`step-${stepIndex}`} color={COLORS.DIM}>
            {"  "}
            {num} {figures.circle} {step.title}
          </Text>,
        );
      }
    }
  }

  const visibleCount = Math.max(1, terminalRows - EXPANDED_VIEWPORT_OVERHEAD);
  const expandedScroll = useScrollableList({
    itemCount: expandedRows.length,
    visibleCount,
  });

  // Snap to bottom when first expanding
  const wasExpandedRef = useRef(false);
  useEffect(() => {
    if (expanded && !wasExpandedRef.current && expandedRows.length > 0) {
      expandedScroll.setHighlightedIndex(expandedRows.length - 1);
    }
    wasExpandedRef.current = expanded;
  }, [expanded, expandedRows.length, expandedScroll]);

  useEffect(() => {
    setRunStartedAt(Date.now());

    const baseUrl = baseUrls && baseUrls.length > 0 ? baseUrls.join(", ") : undefined;

    triggerExecute({
      options: {
        changesFor,
        instruction,
        isHeadless: !browserHeaded,
        cookieBrowserKeys: [...cookieBrowserKeys],
        savedFlow,
        baseUrl,
        devServerHints: devServerHints ? [...devServerHints] : undefined,
        modelPreference:
          modelPreferenceConfigId && modelPreferenceValue
            ? { configId: modelPreferenceConfigId, value: modelPreferenceValue }
            : undefined,
      },
      agentBackend,
      replayHost,
      onUpdate: setExecutedPlan,
      onReplayUrl: setLiveReplayUrl,
      onConfigOptions: (configOptions) => {
        setConfigOptions((previous) => ({
          ...previous,
          [agentBackend]: [...configOptions],
        }));
      },
    });

    return () => {
      triggerExecute(Atom.Interrupt);
    };
  }, [
    triggerExecute,
    agentBackend,
    browserHeaded,
    changesFor,
    instruction,
    savedFlow,
    cookieBrowserKeys,
    baseUrls,
    devServerHints,
    replayHost,
    modelPreferenceConfigId,
    modelPreferenceValue,
    setConfigOptions,
  ]);

  const replayUrl = isExecutionComplete ? executionResult.value.replayUrl : undefined;
  const localReplayUrl = isExecutionComplete ? executionResult.value.localReplayUrl : undefined;
  const videoUrl = isExecutionComplete ? executionResult.value.videoUrl : undefined;

  useEffect(() => {
    if (isExecutionComplete && executedPlan && report) {
      usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
      setScreen(Screen.Results({ report, replayUrl, localReplayUrl, videoUrl }));
    }
  }, [isExecutionComplete, executedPlan, report, replayUrl, localReplayUrl, videoUrl, setScreen]);

  const goToMain = () => {
    usePlanExecutionStore.getState().setExecutedPlan(undefined);
    setScreen(Screen.Main());
  };

  useEffect(() => {
    if (runStartedAt === undefined) return;
    if (!isExecuting) return;
    const interval = setInterval(() => {
      setElapsedTimeMs(Date.now() - runStartedAt);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runStartedAt, isExecuting]);

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (showCancelConfirmation) {
      if (key.return || normalizedInput === "y") {
        setShowCancelConfirmation(false);
        trackEvent("run:cancelled");
        goToMain();
        return;
      }
      if (key.escape || normalizedInput === "n") {
        setShowCancelConfirmation(false);
      }
      return;
    }

    if (normalizedInput === "o" && !key.ctrl && !key.meta && liveReplayUrl) {
      const { exec } = require("node:child_process") as typeof import("node:child_process");
      const escapedUrl = liveReplayUrl.replace(/"/g, '\\"');
      exec(`open "${escapedUrl}"`);
      trackEvent("live_preview:opened");
      return;
    }

    if (key.ctrl && input === "o") {
      toggleExpanded();
      return;
    }

    if (key.ctrl && input === "n") {
      toggleNotifications();
      return;
    }

    if (expanded) {
      if (expandedScroll.handleNavigation(input, key)) return;
      if (key.escape) {
        setExpanded(false);
        return;
      }
      return;
    }

    if (key.escape) {
      if (AsyncResult.isFailure(executionResult)) {
        goToMain();
        return;
      }
      if (isExecuting) {
        setShowCancelConfirmation(true);
        return;
      }
      if (executedPlan && report) {
        usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
        setScreen(Screen.Results({ report, replayUrl, localReplayUrl, videoUrl }));
        return;
      }
      goToMain();
    }
  });

  const visibleExpandedRows = expandedRows.slice(
    expandedScroll.scrollOffset,
    expandedScroll.scrollOffset + visibleCount,
  );

  return (
    <>
      <Static items={[...screenshotPaths]}>
        {(screenshotPath) => (
          <Box key={screenshotPath} paddingX={1}>
            <Image src={screenshotPath} alt={screenshotPath} />
          </Box>
        )}
      </Static>
      <Box flexDirection="column" width="100%">
        <Box flexDirection="column" width="100%" paddingY={1} paddingX={1}>
          <Box>
            <Logo />
            <Text wrap="truncate">
              {" "}
              <Text color={COLORS.DIM}>{figures.pointerSmall}</Text>{" "}
              <Text color={COLORS.TEXT}>{instruction}</Text>
            </Text>
          </Box>

          {liveReplayUrl && isExecuting && (
            <Box marginTop={0}>
              <Text color={COLORS.PRIMARY} bold>
                {"  "}Press{" "}
                <Text color={COLORS.PRIMARY} bold>
                  o
                </Text>{" "}
                to open live preview
              </Text>
            </Box>
          )}

          {expanded ? (
            <Box flexDirection="column" marginTop={1}>
              {visibleExpandedRows}
            </Box>
          ) : (
            <>
              {totalCount === 0 &&
                isExecuting &&
                (() => {
                  const toolCalls = executedPlan
                    ? getPlanningToolCalls(executedPlan.events, false)
                    : [];
                  return (
                    <Box marginTop={1} flexDirection="column">
                      <Box>
                        <Spinner />
                        <Text> </Text>
                        <TextShimmer
                          text={`Starting${figures.ellipsis} ${elapsedTimeLabel}`}
                          baseColor={theme.shimmerBase}
                          highlightColor={theme.shimmerHighlight}
                        />
                      </Box>
                      {toolCalls.map((tool, toolIndex) => (
                        <ToolCallBlock key={toolIndex} display={tool} indent={"  "} />
                      ))}
                    </Box>
                  );
                })()}

              <Box flexDirection="column" marginTop={1}>
                {(executedPlan?.steps ?? []).map((step: TestPlanStep, stepIndex: number) => {
                  const label = Option.isSome(step.summary) ? step.summary.value : step.title;
                  const stepElapsedMs = getStepElapsedMs(step);
                  const stepElapsedLabel =
                    stepElapsedMs !== undefined ? formatElapsedTime(stepElapsedMs) : undefined;
                  const num = `${stepIndex + 1}.`;

                  if (step.status === "active") {
                    const toolCalls = executedPlan
                      ? getActiveStepToolCalls(executedPlan.events, false)
                      : [];
                    return (
                      <Box key={step.id} flexDirection="column">
                        <Box>
                          <Text color={COLORS.DIM}>
                            {"  "}
                            {num}{" "}
                          </Text>
                          <Spinner />
                          <Text> </Text>
                          <TextShimmer
                            text={`${step.title} ${elapsedTimeLabel}`}
                            baseColor={theme.shimmerBase}
                            highlightColor={theme.shimmerHighlight}
                          />
                        </Box>
                        {toolCalls.map((tool, toolIndex) => (
                          <ToolCallBlock key={toolIndex} display={tool} indent={"     "} />
                        ))}
                      </Box>
                    );
                  }

                  if (step.status === "passed") {
                    return (
                      <Text key={step.id}>
                        <Text color={COLORS.DIM}>
                          {"  "}
                          {num}
                        </Text>
                        <Text color={COLORS.GREEN}>
                          {" "}
                          {figures.tick} {cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}
                        </Text>
                        {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
                      </Text>
                    );
                  }

                  if (step.status === "failed") {
                    return (
                      <Text key={step.id}>
                        <Text color={COLORS.DIM}>
                          {"  "}
                          {num}
                        </Text>
                        <Text color={COLORS.RED}>
                          {" "}
                          {figures.cross} {cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}
                        </Text>
                        {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
                      </Text>
                    );
                  }

                  if (step.status === "skipped") {
                    return (
                      <Text key={step.id}>
                        <Text color={COLORS.DIM}>
                          {"  "}
                          {num}
                        </Text>
                        <Text color={COLORS.YELLOW}>
                          {" "}
                          {figures.arrowRight} {cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}
                        </Text>
                        {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
                      </Text>
                    );
                  }

                  return (
                    <Text key={step.id} color={COLORS.DIM}>
                      {"  "}
                      {num} {figures.circle} {step.title}
                    </Text>
                  );
                })}
              </Box>
            </>
          )}

          {showCancelConfirmation && (
            <Box marginTop={1}>
              <Text color={COLORS.YELLOW}>
                Stop run? <Text color={COLORS.PRIMARY}>enter</Text> to stop,{" "}
                <Text color={COLORS.PRIMARY}>esc</Text> to dismiss
              </Text>
            </Box>
          )}
        </Box>

        {AsyncResult.builder(executionResult)
          .onError((error) => <ErrorMessage type="error" error={error} />)
          .onDefect((defect) => (
            <ErrorMessage
              type="defect"
              error={{
                _tag: "Defect",
                message: Cause.pretty(Cause.fail(defect)),
              }}
            />
          ))
          .orNull()}
      </Box>
    </>
  );
};
