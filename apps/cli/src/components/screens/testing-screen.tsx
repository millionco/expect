import { useEffect, useMemo, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { DateTime, Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import * as Atom from "effect/unstable/reactivity/Atom";
import { useAtom, useAtomValue } from "@effect/atom-react";
import stringWidth from "string-width";

import {
  type ChangesFor,
  type SavedFlow,
  TestPlanStep,
  type ExecutedTestPlan,
} from "@expect/shared/models";
import { TESTING_TIMER_UPDATE_INTERVAL_MS, TESTING_TOOL_TEXT_CHAR_LIMIT } from "../../constants";
import { useColors, theme } from "../theme-context";
import { RuledBox } from "../ui/ruled-box";
import { Spinner } from "../ui/spinner";
import { TextShimmer } from "../ui/text-shimmer";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import { ScreenHeading } from "../ui/screen-heading";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time";
import { Image } from "../ui/image";
import { ErrorMessage } from "../ui/error-message";
import { executeFn, screenshotPathsAtom } from "../../data/execution-atom";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";

interface TestingScreenProps {
  changesFor: ChangesFor;
  instruction: string;
  savedFlow?: SavedFlow;
  requiresCookies?: boolean;
}

const getStepElapsedMs = (step: TestPlanStep): number | undefined => {
  if (Option.isNone(step.startedAt)) return undefined;
  const endMs = Option.isSome(step.endedAt)
    ? DateTime.toEpochMillis(step.endedAt.value)
    : Date.now();
  return endMs - DateTime.toEpochMillis(step.startedAt.value);
};

export const TestingScreen = ({
  changesFor,
  instruction,
  savedFlow,
  requiresCookies = false,
}: TestingScreenProps) => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();

  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const browserHeaded = usePreferencesStore((state) => state.browserHeaded);
  const replayHost = usePreferencesStore((state) => state.replayHost);
  const [executionResult, triggerExecute] = useAtom(executeFn, {
    mode: "promiseExit",
  });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);

  const isExecuting = AsyncResult.isWaiting(executionResult);
  const isExecutionComplete = AsyncResult.isSuccess(executionResult);
  const report = isExecutionComplete ? executionResult.value.report : undefined;

  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(undefined);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  const elapsedTimeLabel = useMemo(() => formatElapsedTime(elapsedTimeMs), [elapsedTimeMs]);

  useEffect(() => {
    setRunStartedAt(Date.now());

    triggerExecute({
      options: {
        changesFor,
        instruction,
        isHeadless: !browserHeaded,
        requiresCookies,
        savedFlow,
      },
      agentBackend,
      replayHost,
      onUpdate: setExecutedPlan,
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
    requiresCookies,
  ]);

  const replayUrl = isExecutionComplete ? executionResult.value.replayUrl : undefined;

  useEffect(() => {
    if (isExecutionComplete && executedPlan && report) {
      usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
      setScreen(Screen.Results({ report, replayUrl }));
    }
  }, [isExecutionComplete, executedPlan, report, replayUrl, setScreen]);

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
        goToMain();
        return;
      }
      if (key.escape || normalizedInput === "n") {
        setShowCancelConfirmation(false);
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
        setScreen(Screen.Results({ report, replayUrl }));
        return;
      }
      goToMain();
    }
  });

  const completedCount = executedPlan?.steps
    ? executedPlan.steps.filter(
        (step: TestPlanStep) => step.status === "passed" || step.status === "failed",
      ).length
    : 0;
  const totalCount = executedPlan?.steps ? executedPlan.steps.length : 0;
  const currentActiveStep = executedPlan?.steps?.find(
    (step: TestPlanStep) => step.status === "active",
  );
  const runStatusLabel = currentActiveStep
    ? `Running ${currentActiveStep.title}`
    : completedCount === totalCount && totalCount > 0
      ? "Finishing up"
      : "Starting";

  const progressStateLabel = isExecuting ? "RUNNING" : "COMPLETE";
  const progressStateText = `${figures.bullet} ${progressStateLabel}`;
  const progressCountText = ` ${completedCount}/${totalCount} `;
  const elapsedTimeText = isExecuting ? ` ${figures.pointerSmall} ${elapsedTimeLabel}` : "";
  const progressRowWidth = Math.max(0, columns - 2);
  const progressBarWidth = Math.max(
    0,
    progressRowWidth -
      stringWidth(progressStateText) -
      1 -
      stringWidth(progressCountText) -
      1 -
      stringWidth(elapsedTimeText),
  );
  const filledWidth =
    totalCount > 0 ? Math.round((completedCount / totalCount) * progressBarWidth) : 0;
  const emptyWidth = progressBarWidth - filledWidth;

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
          <ScreenHeading title="Running browser test" subtitle={instruction} showDivider={false} />
        </Box>

        <Box marginTop={1} paddingX={1} alignItems="center">
          <Text bold color={COLORS.SELECTION}>
            {progressStateText}
          </Text>
          <Text> </Text>
          <Text backgroundColor={COLORS.SELECTION}>{" ".repeat(filledWidth)}</Text>
          <Text backgroundColor={COLORS.DIVIDER}>{" ".repeat(emptyWidth)}</Text>
          <Text> </Text>
          <Text backgroundColor={COLORS.DIVIDER} color={COLORS.TEXT}>
            {progressCountText}
          </Text>
          {elapsedTimeText ? <Text color={COLORS.DIM}>{elapsedTimeText}</Text> : null}
        </Box>

        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {(executedPlan?.steps ?? []).map((step: TestPlanStep, stepIndex: number) => {
            const stepPrefix = `Step ${stepIndex + 1}`;
            const label = Option.isSome(step.summary) ? step.summary.value : step.title;
            const stepElapsedMs = getStepElapsedMs(step);
            const stepElapsedLabel =
              stepElapsedMs !== undefined ? formatElapsedTime(stepElapsedMs) : undefined;
            return (
              <Box key={step.id} flexDirection="column">
                {step.status === "passed" && (
                  <Text color={COLORS.GREEN}>
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(
                      label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT,
                    )}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                )}
                {step.status === "failed" && (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(
                      label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT,
                    )}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                )}
                {step.status === "active" && (
                  <Box>
                    <Text>{"  "}</Text>
                    <Spinner />
                    <Text> </Text>
                    <TextShimmer
                      text={`${stepPrefix} ${step.title} ${formatElapsedTime(
                        Math.round(elapsedTimeMs),
                      )}`}
                      baseColor={theme.shimmerBase}
                      highlightColor={theme.shimmerHighlight}
                    />
                  </Box>
                )}
                {step.status !== "passed" &&
                  step.status !== "failed" &&
                  step.status !== "active" && (
                    <Text color={COLORS.DIM}>{`  ○ ${stepPrefix} ${step.title}`}</Text>
                  )}
              </Box>
            );
          })}
        </Box>

        {showCancelConfirmation && (
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
        )}

        {isExecuting && !showCancelConfirmation && (
          <Box marginTop={1} paddingX={1} flexDirection="column">
            <TextShimmer
              text={`${runStatusLabel}${figures.ellipsis} ${elapsedTimeLabel}`}
              baseColor={theme.shimmerBase}
              highlightColor={theme.shimmerHighlight}
            />
          </Box>
        )}

        {AsyncResult.builder(executionResult)
          .onSuccess(() => (
            <Box marginTop={1} flexDirection="column" paddingX={1}>
              <Text color={COLORS.GREEN} bold>
                Done
              </Text>
            </Box>
          ))
          .orNull()}

        {AsyncResult.builder(executionResult)
          .onError((error) => (
            <Box paddingX={1}>
              <ErrorMessage message={error instanceof Error ? error.message : String(error)} />
            </Box>
          ))
          .orNull()}
      </Box>
    </>
  );
};
