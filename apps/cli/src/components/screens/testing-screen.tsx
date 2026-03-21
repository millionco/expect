import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom, useAtomValue, useAtomSet } from "@effect/atom-react";
import {
  changesForDisplayName,
  type ChangesFor,
  type StepId,
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
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { useNavigationStore, Screen } from "../../stores/use-navigation.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { Image } from "../ui/image.js";
import { ErrorMessage } from "../ui/error-message.js";
import { createPlanFn } from "../../data/planning-atom.js";
import { executePlanFn, screenshotPathsAtom } from "../../data/execution-atom.js";

interface TestingScreenProps {
  changesFor: ChangesFor;
  instruction: string;
}

export const TestingScreen = ({ changesFor, instruction }: TestingScreenProps) => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();

  const displayName = changesForDisplayName(changesFor);

  const initialPlan = usePlanStore.getState().readyTestPlan;
  const [testPlan, setTestPlan] = useState<TestPlan | undefined>(initialPlan);
  const [planningError, setPlanningError] = useState<string | undefined>(undefined);

  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const triggerCreatePlan = useAtomSet(createPlanFn, { mode: "promise" });
  const [executionResult, triggerExecute] = useAtom(executePlanFn, { mode: "promiseExit" });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);
  const running = testPlan ? AsyncResult.isWaiting(executionResult) : false;
  const done = AsyncResult.isSuccess(executionResult);
  const error = AsyncResult.isFailure(executionResult)
    ? executionResult.cause instanceof Error
      ? executionResult.cause.message
      : String(executionResult.cause)
    : undefined;
  const report = done ? executionResult.value.report : undefined;

  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(undefined);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);

  const stepTimingsRef = useRef(new Map<StepId, { startedAt: number; endedAt?: number }>());

  const elapsedTimeLabel = useMemo(() => formatElapsedTime(elapsedTimeMs), [elapsedTimeMs]);

  const handlePlanUpdate = useCallback((updated: ExecutedTestPlan) => {
    setExecutedPlan(updated);
    const now = Date.now();
    const timings = stepTimingsRef.current;
    for (const step of updated.steps) {
      if (step.status === "active" && !timings.has(step.id)) {
        timings.set(step.id, { startedAt: now });
      } else if (
        (step.status === "passed" || step.status === "failed") &&
        timings.has(step.id) &&
        !timings.get(step.id)!.endedAt
      ) {
        timings.get(step.id)!.endedAt = now;
      }
    }
  }, []);

  // Planning phase: create plan if not provided
  const planningStartedRef = useRef(false);
  useEffect(() => {
    if (testPlan || planningStartedRef.current) return;
    planningStartedRef.current = true;
    setRunStartedAt(Date.now());

    triggerCreatePlan({ changesFor, flowInstruction: instruction, agentBackend })
      .then((plan) => {
        usePlanStore.getState().setReadyTestPlan(plan);

        const { skipPlanning } = usePreferencesStore.getState();
        if (skipPlanning) {
          setTestPlan(plan);
        } else {
          setScreen(Screen.ReviewPlan({ plan }));
        }
      })
      .catch((planError) => {
        setPlanningError(planError instanceof Error ? planError.message : String(planError));
      });
  }, [testPlan, changesFor, instruction, agentBackend, triggerCreatePlan, setScreen]);

  // Execution phase: start when plan becomes available
  const executionStartedRef = useRef(false);
  useEffect(() => {
    if (!testPlan || executionStartedRef.current || exitRequested) return;
    executionStartedRef.current = true;
    if (runStartedAt === undefined) {
      setRunStartedAt(Date.now());
    }
    triggerExecute({ testPlan, agentBackend, onUpdate: handlePlanUpdate });
  }, [testPlan, agentBackend, triggerExecute, handlePlanUpdate, runStartedAt, exitRequested]);

  // Exit when exitRequested and no longer running/planning
  useEffect(() => {
    if (!exitRequested) return;
    if (running) return;
    usePlanStore.getState().setPlan(undefined);
    usePlanStore.getState().setReadyTestPlan(undefined);
    usePlanExecutionStore.getState().setExecutedPlan(undefined);
    setScreen(Screen.Main());
  }, [exitRequested, running, setScreen]);

  // HACK: setInterval for elapsed time — no atom equivalent yet
  useEffect(() => {
    if (runStartedAt === undefined) return;
    if (!running && testPlan) return;
    setElapsedTimeMs(Date.now() - runStartedAt);
    const interval = setInterval(() => {
      setElapsedTimeMs(Date.now() - runStartedAt);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runStartedAt, running, testPlan]);

  // Auto-navigate to results on completion
  useEffect(() => {
    if (done && executedPlan && report && !exitRequested) {
      usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
      setScreen(Screen.Results({ report }));
    }
  }, [done, executedPlan, report, setScreen, exitRequested]);

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (exitRequested) {
      return;
    }

    if (showCancelConfirmation) {
      if (key.return || normalizedInput === "y") {
        setShowCancelConfirmation(false);
        setExitRequested(true);
        return;
      }
      if (key.escape || normalizedInput === "n") {
        setShowCancelConfirmation(false);
      }
      return;
    }

    if (key.escape) {
      if (planningError) {
        usePlanStore.getState().setPlan(undefined);
        usePlanStore.getState().setReadyTestPlan(undefined);
        setScreen(Screen.Main());
        return;
      }
      if (planning || running) {
        setShowCancelConfirmation(true);
        return;
      }
      if (executedPlan && report) {
        usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
        setScreen(Screen.Results({ report }));
        return;
      }
      usePlanStore.getState().setPlan(undefined);
      usePlanStore.getState().setReadyTestPlan(undefined);
      usePlanExecutionStore.getState().setExecutedPlan(undefined);
      setScreen(Screen.Main());
    }
  });

  const planning = !testPlan && !planningError;
  const planToRender = executedPlan ?? testPlan;

  const completedCount = planToRender
    ? planToRender.steps.filter((step) => step.status === "passed" || step.status === "failed")
        .length
    : 0;
  const totalCount = planToRender ? planToRender.steps.length : 0;
  const currentActiveStep = planToRender?.steps.find((step) => step.status === "active");
  const runStatusLabel = planning
    ? "Planning"
    : currentActiveStep
      ? `Running ${currentActiveStep.title}`
      : completedCount === totalCount && totalCount > 0
        ? "Finishing up"
        : "Starting";

  const filledWidth =
    totalCount > 0 ? Math.round((completedCount / totalCount) * PROGRESS_BAR_WIDTH) : 0;
  const emptyWidth = PROGRESS_BAR_WIDTH - filledWidth;

  const getStepElapsed = (stepId: StepId): number | undefined => {
    const timing = stepTimingsRef.current.get(stepId);
    if (!timing) return undefined;
    return (timing.endedAt ?? Date.now()) - timing.startedAt;
  };

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
            {running || planning ? ` ${figures.pointerSmall} ${elapsedTimeLabel}` : ""}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {(planToRender?.steps ?? []).map((step, stepIndex) => {
            const stepPrefix = `Step ${stepIndex + 1}`;
            const label = Option.isSome(step.summary) ? step.summary.value : step.title;
            const stepElapsedMs = getStepElapsed(step.id);
            const stepElapsedLabel =
              stepElapsedMs !== undefined ? formatElapsedTime(stepElapsedMs) : undefined;
            return (
              <Box key={step.id} flexDirection="column">
                {step.status === "passed" ? (
                  <Text color={COLORS.GREEN}>
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                ) : step.status === "failed" ? (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(label, TESTING_TOOL_TEXT_CHAR_LIMIT)}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                ) : step.status === "active" ? (
                  <Box>
                    <Text>{"  "}</Text>
                    <Spinner />
                    <Text> </Text>
                    <TextShimmer
                      text={`${stepPrefix} ${step.title} ${formatElapsedTime(Math.round(elapsedTimeMs))}`}
                      baseColor={COLORS.SELECTION}
                      highlightColor={COLORS.PRIMARY}
                    />
                  </Box>
                ) : (
                  <Text color={COLORS.DIM}>{`  ○ ${stepPrefix} ${step.title}`}</Text>
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

        {(running || planning) && !showCancelConfirmation ? (
          <Box marginTop={1} paddingX={1}>
            <TextShimmer
              text={`${exitRequested ? "Stopping" : runStatusLabel}${figures.ellipsis} ${elapsedTimeLabel}`}
              baseColor={COLORS.DIM}
              highlightColor={COLORS.PRIMARY}
            />
          </Box>
        ) : null}

        {!running && !planning && !error && !planningError ? (
          <Box marginTop={1} flexDirection="column" paddingX={1}>
            <Text color={COLORS.GREEN} bold>
              Done
            </Text>
          </Box>
        ) : null}

        <Box paddingX={1}>
          <ErrorMessage message={planningError ?? error} />
        </Box>
      </Box>
    </>
  );
};
