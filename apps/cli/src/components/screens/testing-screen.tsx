import { useEffect, useMemo, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { changesForDisplayName } from "@browser-tester/shared/models";
import {
  PROGRESS_BAR_WIDTH,
  TESTING_TIMER_UPDATE_INTERVAL_MS,
  TESTING_TOOL_TEXT_CHAR_LIMIT,
} from "../../constants.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { Spinner } from "../ui/spinner.js";
import { TextShimmer } from "../ui/text-shimmer.js";
import { usePlanStore } from "../../stores/use-plan-store.js";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store.js";
import { useNavigationStore } from "../../stores/use-navigation.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { Image } from "../ui/image.js";
import { ErrorMessage } from "../ui/error-message.js";
import { executePlanFn, screenshotPathsAtom } from "../../data/execution-atom.js";

const TOOL_CALL_DISPLAY_MODE_COMPACT = "compact";
const TOOL_CALL_DISPLAY_MODE_DETAILED = "detailed";
const TOOL_CALL_DISPLAY_MODE_HIDDEN = "hidden";
const TRACE_DISPLAY_SHORTCUT_KEY = "v";

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

export const TestingScreen = () => {
  const planState = usePlanStore((state) => state.plan);
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();

  const testPlan = planState?._tag === "plan" ? planState : undefined;
  const displayName = testPlan ? changesForDisplayName(testPlan.changesFor) : "working tree";

  const [executionResult, triggerExecute] = useAtom(executePlanFn, { mode: "promiseExit" });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);
  const running = AsyncResult.isWaiting(executionResult);
  const done = AsyncResult.isSuccess(executionResult);
  const error = AsyncResult.isFailure(executionResult) ? String(executionResult.cause) : undefined;
  const executedPlan = done ? executionResult.value.executedPlan : undefined;

  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(undefined);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [toolCallDisplayMode, setToolCallDisplayMode] = useState(TOOL_CALL_DISPLAY_MODE_COMPACT);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  const elapsedTimeLabel = useMemo(() => formatElapsedTime(elapsedTimeMs), [elapsedTimeMs]);

  // HACK: setInterval for elapsed time — no atom equivalent yet
  useEffect(() => {
    if (!running || runStartedAt === undefined) return;
    setElapsedTimeMs(Date.now() - runStartedAt);
    const interval = setInterval(() => {
      setElapsedTimeMs(Date.now() - runStartedAt);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runStartedAt, running]);

  const startExecution = () => {
    if (!testPlan) return;
    setRunStartedAt(Date.now());
    setElapsedTimeMs(0);
    setShowCancelConfirmation(false);
    triggerExecute({ testPlan });
  };

  // HACK: trigger execution on mount — this should be driven by the parent
  useEffect(() => {
    if (!testPlan) return;
    startExecution();
  }, [testPlan]);

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (showCancelConfirmation) {
      if (key.return || normalizedInput === "y") {
        setShowCancelConfirmation(false);
        usePlanStore.getState().setPlan(undefined);
        usePlanExecutionStore.getState().setExecutedPlan(undefined);
        setScreen("main");
        return;
      }
      if (key.escape || normalizedInput === "n") {
        setShowCancelConfirmation(false);
      }
      return;
    }

    if (input === TRACE_DISPLAY_SHORTCUT_KEY) {
      setToolCallDisplayMode((previous) => getNextToolCallDisplayMode(previous));
      return;
    }

    if (key.escape) {
      if (running) {
        setShowCancelConfirmation(true);
        return;
      }
      if (executedPlan) {
        usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
        setScreen("results");
        return;
      }
      usePlanStore.getState().setPlan(undefined);
      usePlanExecutionStore.getState().setExecutedPlan(undefined);
      setScreen("main");
    }
  });

  const activeStepId = executedPlan?.activeStepId ?? undefined;
  const currentToolCallText =
    executedPlan && toolCallDisplayMode !== TOOL_CALL_DISPLAY_MODE_HIDDEN
      ? (executedPlan.lastToolCallDisplayText ?? undefined)
      : undefined;

  if (!testPlan) return null;

  const testReport = executedPlan?.testReport;
  const reportStepsById = testReport
    ? new Map(testReport.steps.map((step) => [step.stepId, step]))
    : new Map();

  const steps = testPlan.steps.map((step) => {
    const reportStep = reportStepsById.get(step.id);
    const isActive = step.id === activeStepId;
    const status = isActive
      ? ("active" as const)
      : reportStep?.status === "not-run"
        ? ("pending" as const)
        : (reportStep?.status ?? ("pending" as const));
    const label =
      status === "pending" || status === "active" ? step.title : reportStep?.summary || step.title;
    return { stepId: step.id, status, label };
  });

  const completedCount = executedPlan?.completedStepCount ?? 0;
  const totalCount = steps.length;
  const currentActiveStep = executedPlan?.activeStep;
  const runStatusLabel = currentActiveStep
    ? `Running ${currentActiveStep.title}`
    : completedCount === totalCount
      ? "Finishing up"
      : "Starting";

  const planTitle = testPlan.title;
  const filledWidth =
    totalCount > 0 ? Math.round((completedCount / totalCount) * PROGRESS_BAR_WIDTH) : 0;
  const emptyWidth = PROGRESS_BAR_WIDTH - filledWidth;

  return (
    <>
      <Static items={[...screenshotPaths]}>
        {(screenshotPath) => (
          <Box key={screenshotPath} paddingX={1}>
            <Image src={screenshotPath} alt={screenshotPath} />
          </Box>
        )}
      </Static>
      <Box flexDirection="column" width="100%" paddingY={1}>
        <Box paddingX={1}>
          <ScreenHeading
            title="Executing browser plan"
            subtitle={`${planTitle} │ ${displayName}`}
          />
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text>
            <Text color={COLORS.PRIMARY}>{"━".repeat(filledWidth)}</Text>
            <Text color={COLORS.BORDER}>{"─".repeat(emptyWidth)}</Text>
          </Text>
          <Text color={COLORS.DIM}>
            {`  ${completedCount}/${totalCount}`}
            {running ? ` ${figures.pointerSmall} ${elapsedTimeLabel}` : ""}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {steps.map((step, stepIndex) => {
            const stepPrefix = `Step ${stepIndex + 1}`;
            return (
              <Box key={step.stepId} flexDirection="column">
                {step.status === "passed" ? (
                  <Text color={COLORS.GREEN}>
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(step.label, TESTING_TOOL_TEXT_CHAR_LIMIT)}`}
                  </Text>
                ) : step.status === "failed" ? (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(step.label, TESTING_TOOL_TEXT_CHAR_LIMIT)}`}
                  </Text>
                ) : step.status === "active" ? (
                  <>
                    <Box>
                      <Text>{"  "}</Text>
                      <Spinner />
                      <Text> </Text>
                      <TextShimmer
                        text={`${stepPrefix} ${step.label} ${formatElapsedTime(Math.round(elapsedTimeMs))}`}
                        baseColor={COLORS.SELECTION}
                        highlightColor={COLORS.PRIMARY}
                      />
                    </Box>
                    {currentToolCallText ? (
                      <Text color={COLORS.DIM}>
                        {`    ${figures.pointerSmall} ${currentToolCallText}`}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text color={COLORS.DIM}>{`  ○ ${stepPrefix} ${step.label}`}</Text>
                )}
              </Box>
            );
          })}
        </Box>

        {showCancelConfirmation ? (
          <RuledBox color={COLORS.YELLOW} marginTop={1}>
            <Text color={COLORS.YELLOW} bold>
              Stop this browser run?
            </Text>
            <Text color={COLORS.DIM}>This will terminate the agent and close the browser.</Text>
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>Enter</Text> or{" "}
              <Text color={COLORS.PRIMARY}>y</Text> to stop, or{" "}
              <Text color={COLORS.PRIMARY}>Esc</Text> or <Text color={COLORS.PRIMARY}>n</Text> to
              keep it running.
            </Text>
          </RuledBox>
        ) : null}

        {running && !showCancelConfirmation ? (
          <Box marginTop={1} paddingX={1}>
            <TextShimmer
              text={`${runStatusLabel}${figures.ellipsis} ${elapsedTimeLabel}`}
              baseColor={COLORS.DIM}
              highlightColor={COLORS.PRIMARY}
            />
          </Box>
        ) : null}

        {done ? (
          <Box marginTop={1} flexDirection="column" paddingX={1}>
            <Text color={COLORS.GREEN} bold>
              Done
            </Text>
          </Box>
        ) : null}

        <Box paddingX={1}>
          <ErrorMessage message={error ? `Error: ${error}` : undefined} />
        </Box>
      </Box>
    </>
  );
};
