import { useEffect, useMemo, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom, useAtomValue } from "@effect/atom-react";
import {
  changesForDisplayName,
  type TestPlan,
  type ExecutedTestPlan,
} from "@browser-tester/shared/models";
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
import { useNavigationStore, Screen } from "../../stores/use-navigation.js";
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

interface TestingScreenProps {
  plan: TestPlan;
}

export const TestingScreen = ({ plan }: TestingScreenProps) => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();

  const displayName = changesForDisplayName(plan.changesFor);

  const [executionResult, triggerExecute] = useAtom(executePlanFn, { mode: "promiseExit" });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);
  const running = AsyncResult.isWaiting(executionResult);
  const done = AsyncResult.isSuccess(executionResult);
  const error = AsyncResult.isFailure(executionResult) ? String(executionResult.cause) : undefined;
  const report = done ? executionResult.value.report : undefined;

  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [started, setStarted] = useState(false);
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

  const startRun = () => {
    setStarted(true);
    setRunStartedAt(Date.now());
    triggerExecute({ testPlan: plan, onUpdate: setExecutedPlan });
  };

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (!started) {
      if (key.return || normalizedInput === "y") {
        startRun();
      }
      if (key.escape || normalizedInput === "n") {
        setScreen(Screen.Main());
      }
      return;
    }

    if (showCancelConfirmation) {
      if (key.return || normalizedInput === "y") {
        setShowCancelConfirmation(false);
        usePlanStore.getState().setPlan(undefined);
        usePlanExecutionStore.getState().setExecutedPlan(undefined);
        setScreen(Screen.Main());
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
      if (executedPlan && report) {
        usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
        setScreen(Screen.Results({ report }));
        return;
      }
      usePlanStore.getState().setPlan(undefined);
      usePlanExecutionStore.getState().setExecutedPlan(undefined);
      setScreen(Screen.Main());
    }
  });

  const activeStepId = executedPlan?.activeStepId ?? undefined;
  const currentToolCallText =
    executedPlan && toolCallDisplayMode !== TOOL_CALL_DISPLAY_MODE_HIDDEN
      ? (executedPlan.lastToolCallDisplayText ?? undefined)
      : undefined;

  const stepStatuses = report?.stepStatuses ?? new Map();

  const steps = plan.steps.map((step) => {
    const entry = stepStatuses.get(step.id);
    const isActive = step.id === activeStepId;
    const status = isActive
      ? ("active" as const)
      : entry?.status === "not-run"
        ? ("pending" as const)
        : (entry?.status ?? ("pending" as const));
    const label =
      status === "pending" || status === "active" ? step.title : entry?.summary || step.title;
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

  const filledWidth =
    totalCount > 0 ? Math.round((completedCount / totalCount) * PROGRESS_BAR_WIDTH) : 0;
  const emptyWidth = PROGRESS_BAR_WIDTH - filledWidth;

  if (!started) {
    return (
      <Box flexDirection="column" width="100%" paddingY={1}>
        <Box paddingX={1}>
          <ScreenHeading title="Ready to execute" subtitle={`${plan.title} │ ${displayName}`} />
        </Box>
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {plan.steps.map((step, index) => (
            <Text key={step.id} color={COLORS.DIM}>
              {`  ${index + 1}. ${step.title}`}
            </Text>
          ))}
        </Box>
        <Box marginTop={1} paddingX={1}>
          <Text color={COLORS.DIM}>
            Press <Text color={COLORS.PRIMARY}>Enter</Text> or <Text color={COLORS.PRIMARY}>y</Text>{" "}
            to start, or <Text color={COLORS.PRIMARY}>Esc</Text> to go back.
          </Text>
        </Box>
      </Box>
    );
  }

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
            subtitle={`${plan.title} │ ${displayName}`}
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
