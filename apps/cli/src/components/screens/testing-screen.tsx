import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { DateTime, Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom, useAtomValue } from "@effect/atom-react";
import {
  ChangesFor,
  changesForDisplayName,
  PlanId,
  TestPlan,
  type ExecutedTestPlan,
  type TestPlanStep,
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
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { useNavigationStore, Screen } from "../../stores/use-navigation.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { Image } from "../ui/image.js";
import { ErrorMessage } from "../ui/error-message.js";
import { createPlanFn } from "../../data/planning-atom.js";
import {
  executePlanFn,
  screenshotPathsAtom,
} from "../../data/execution-atom.js";

interface TestingScreenProps {
  changesFor: ChangesFor;
  instruction: string;
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
}: TestingScreenProps) => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();

  const displayName = changesForDisplayName(changesFor);

  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const [planResult, triggerCreatePlan] = useAtom(createPlanFn, {
    mode: "promiseExit",
  });
  const [executionResult, triggerExecute] = useAtom(executePlanFn, {
    mode: "promiseExit",
  });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);

  const testPlan = AsyncResult.isSuccess(planResult)
    ? planResult.value
    : undefined;
  const isPlanning = AsyncResult.isWaiting(planResult);

  const isExecutingPlan =
    Boolean(testPlan) && AsyncResult.isWaiting(executionResult);
  const isExecutionComplete = AsyncResult.isSuccess(executionResult);
  const report = isExecutionComplete ? executionResult.value.report : undefined;

  const [executedPlan, setExecutedPlan] = useState<
    ExecutedTestPlan | undefined
  >(undefined);
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(
    undefined
  );
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  const elapsedTimeLabel = useMemo(
    () => formatElapsedTime(elapsedTimeMs),
    [elapsedTimeMs]
  );

  useEffect(() => {
    triggerCreatePlan({
      changesFor,
      flowInstruction: instruction,
    });
  }, []);

  const goToMain = () => {
    usePlanStore.getState().setPlan(undefined);
    usePlanExecutionStore.getState().setExecutedPlan(undefined);
    setScreen(Screen.Main());
  };

  useEffect(() => {
    if (runStartedAt === undefined) return;
    if (!isExecutingPlan && !isPlanning) return;
    const interval = setInterval(() => {
      setElapsedTimeMs(Date.now() - runStartedAt);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runStartedAt, isExecutingPlan, isPlanning]);

  const hasExecutionTriggered = !AsyncResult.isInitial(executionResult);
  const awaitingApproval = Boolean(testPlan) && !hasExecutionTriggered;

  async function executePlan(plan: TestPlan) {
    const exit = await triggerExecute({
      testPlan: plan,
      agentBackend,
      onUpdate: setExecutedPlan,
    });
    if (exit._tag === "Success") {
      const { executedPlan, report } = exit.value;
      usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
      setScreen(Screen.Results({ report }));
    }
  }

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

    if (awaitingApproval) {
      if (key.return || normalizedInput === "y") {
        return executePlan(testPlan!);
      }
      if (key.escape || normalizedInput === "n") {
        goToMain();
        return;
      }
      return;
    }

    if (key.escape) {
      if (
        AsyncResult.isFailure(planResult) ||
        AsyncResult.isFailure(executionResult)
      ) {
        goToMain();
        return;
      }
      if (isPlanning || isExecutingPlan) {
        setShowCancelConfirmation(true);
        return;
      }
      if (executedPlan && report) {
        usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
        // setScreen(Screen.Results({ report }));
        return;
      }
      goToMain();
    }
  });

  const planToRender = executedPlan ?? testPlan;

  const completedCount = planToRender?.steps
    ? planToRender.steps.filter(
        (step) => step.status === "passed" || step.status === "failed"
      ).length
    : 0;
  const totalCount = planToRender?.steps ? planToRender.steps.length : 0;
  const currentActiveStep = planToRender?.steps?.find(
    (step) => step.status === "active"
  );
  const runStatusLabel = isPlanning
    ? "Planning"
    : currentActiveStep
    ? `Running ${currentActiveStep.title}`
    : completedCount === totalCount && totalCount > 0
    ? "Finishing up"
    : "Starting";

  const filledWidth =
    totalCount > 0
      ? Math.round((completedCount / totalCount) * PROGRESS_BAR_WIDTH)
      : 0;
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
            subtitle={`${instruction} │ ${displayName}`}
          />
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text>
            <Text color={COLORS.PRIMARY}>{"━".repeat(filledWidth)}</Text>
            <Text color={COLORS.BORDER}>{"─".repeat(emptyWidth)}</Text>
          </Text>
          <Text color={COLORS.DIM}>
            {`  ${completedCount}/${totalCount}`}
            {isExecutingPlan || isPlanning
              ? ` ${figures.pointerSmall} ${elapsedTimeLabel}`
              : ""}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {(planToRender?.steps ?? []).map((step, stepIndex) => {
            const stepPrefix = `Step ${stepIndex + 1}`;
            const label = Option.isSome(step.summary)
              ? step.summary.value
              : step.title;
            const stepElapsedMs = getStepElapsedMs(step);
            const stepElapsedLabel =
              stepElapsedMs !== undefined
                ? formatElapsedTime(stepElapsedMs)
                : undefined;
            return (
              <Box key={step.id} flexDirection="column">
                {step.status === "passed" ? (
                  <Text color={COLORS.GREEN}>
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(
                      label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT
                    )}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                ) : step.status === "failed" ? (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(
                      label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT
                    )}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                ) : step.status === "active" ? (
                  <Box>
                    <Text>{"  "}</Text>
                    <Spinner />
                    <Text> </Text>
                    <TextShimmer
                      text={`${stepPrefix} ${step.title} ${formatElapsedTime(
                        Math.round(elapsedTimeMs)
                      )}`}
                      baseColor={COLORS.SELECTION}
                      highlightColor={COLORS.PRIMARY}
                    />
                  </Box>
                ) : (
                  <Text
                    color={COLORS.DIM}
                  >{`  ○ ${stepPrefix} ${step.title}`}</Text>
                )}
              </Box>
            );
          })}
        </Box>

        {awaitingApproval ? (
          <RuledBox color={COLORS.PRIMARY} marginTop={1}>
            <Text color={COLORS.PRIMARY} bold>
              Run this plan?
            </Text>
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>Enter</Text> to run, or{" "}
              <Text color={COLORS.PRIMARY}>Esc</Text> to cancel.
            </Text>
          </RuledBox>
        ) : null}

        {showCancelConfirmation ? (
          <RuledBox color={COLORS.YELLOW} marginTop={1}>
            <Text color={COLORS.YELLOW} bold>
              Stop this browser run?
            </Text>
            <Text color={COLORS.DIM}>
              This will terminate the agent and close the browser.
            </Text>
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>Enter</Text> or{" "}
              <Text color={COLORS.PRIMARY}>y</Text> to stop, or{" "}
              <Text color={COLORS.PRIMARY}>Esc</Text> or{" "}
              <Text color={COLORS.PRIMARY}>n</Text> to keep it running.
            </Text>
          </RuledBox>
        ) : null}

        {(isExecutingPlan || isPlanning) && !showCancelConfirmation ? (
          <Box marginTop={1} paddingX={1}>
            <TextShimmer
              text={`${runStatusLabel}${figures.ellipsis} ${elapsedTimeLabel}`}
              baseColor={COLORS.DIM}
              highlightColor={COLORS.PRIMARY}
            />
          </Box>
        ) : null}

        {AsyncResult.builder(executionResult)
          .onSuccess(() => (
            <Box marginTop={1} flexDirection="column" paddingX={1}>
              <Text color={COLORS.GREEN} bold>
                Done
              </Text>
            </Box>
          ))
          .orNull()}

        {AsyncResult.builder(planResult)
          .onError((error) => (
            <Box paddingX={1}>
              <ErrorMessage message={error instanceof Error ? error.message : String(error)} />
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
