import { useEffect, useMemo, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { DateTime, Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import * as Atom from "effect/unstable/reactivity/Atom";
import { useAtom, useAtomValue } from "@effect/atom-react";
import stringWidth from "string-width";

import {
  ChangesFor,
  PlanId,
  StepId,
  TestPlan,
  TestPlanStep,
  type ExecutedTestPlan,
} from "@expect/shared/models";
import {
  TESTING_TIMER_UPDATE_INTERVAL_MS,
  TESTING_TOOL_TEXT_CHAR_LIMIT,
} from "../../constants";
import { useColors } from "../theme-context";
import { RuledBox } from "../ui/ruled-box";
import { Spinner } from "../ui/spinner";
import { TextShimmer } from "../ui/text-shimmer";
import { usePlanStore, Plan } from "../../stores/use-plan-store";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import { ScreenHeading } from "../ui/screen-heading";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time";
import { Image } from "../ui/image";
import { ErrorMessage } from "../ui/error-message";
import { createPlanFn } from "../../data/planning-atom";
import { executePlanFn, screenshotPathsAtom } from "../../data/execution-atom";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";

interface TestingScreenProps {
  changesFor: ChangesFor;
  instruction: string;
  existingPlan?: TestPlan;
}

const getStepElapsedMs = (step: TestPlanStep): number | undefined => {
  if (Option.isNone(step.startedAt)) return undefined;
  const endMs = Option.isSome(step.endedAt)
    ? DateTime.toEpochMillis(step.endedAt.value)
    : Date.now();
  return endMs - DateTime.toEpochMillis(step.startedAt.value);
};

export const TestingScreen = ({ changesFor, instruction, existingPlan }: TestingScreenProps) => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();

  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const skipPlanning = usePreferencesStore((state) => state.skipPlanning);
  const [planResult, triggerCreatePlan] = useAtom(createPlanFn, {
    mode: "promiseExit",
  });
  const [executionResult, triggerExecute] = useAtom(executePlanFn, {
    mode: "promiseExit",
  });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);

  const plannedTestPlan = AsyncResult.isSuccess(planResult) ? planResult.value : undefined;
  const testPlan = existingPlan ?? plannedTestPlan;
  const isPlanning = !existingPlan && AsyncResult.isWaiting(planResult);

  const isExecutingPlan = Boolean(testPlan) && AsyncResult.isWaiting(executionResult);
  const isExecutionComplete = AsyncResult.isSuccess(executionResult);
  const report = isExecutionComplete ? executionResult.value.report : undefined;

  const [planningStatus, setPlanningStatus] = useState("");
  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(undefined);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  const elapsedTimeLabel = useMemo(() => formatElapsedTime(elapsedTimeMs), [elapsedTimeMs]);

  useEffect(() => {
    setRunStartedAt(Date.now());

    const runPlan = async (plan: TestPlan) => {
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
    };

    if (existingPlan) {
      runPlan(existingPlan);
      return;
    }

    if (skipPlanning) {
      const syntheticPlan = new TestPlan({
        id: PlanId.makeUnsafe(crypto.randomUUID()),
        changesFor,
        currentBranch: "",
        diffPreview: "",
        fileStats: [],
        instruction,
        baseUrl: Option.none(),
        isHeadless: true,
        requiresCookies: false,
        title: instruction,
        rationale: "Direct execution (planning skipped)",
        steps: [
          new TestPlanStep({
            id: StepId.makeUnsafe("step-01"),
            title: instruction,
            instruction,
            expectedOutcome: "Verify the changes work correctly",
            routeHint: Option.none(),
            status: "pending",
            summary: Option.none(),
            startedAt: Option.none(),
            endedAt: Option.none(),
          }),
        ],
      });
      runPlan(syntheticPlan);
      return;
    }

    triggerCreatePlan({
      changesFor,
      flowInstruction: instruction,
      onUpdate: (updates) => {
        for (const update of updates) {
          if (update.sessionUpdate === "tool_call") {
            setPlanningStatus(`Tool: ${update.title}`);
          } else if (
            update.sessionUpdate === "agent_thought_chunk" ||
            update.sessionUpdate === "agent_message_chunk"
          ) {
            const { content } = update;
            if (content.type === "text" && content.text) {
              setPlanningStatus((prev) => prev + content.text);
            }
          }
        }
      },
    });
    return () => {
      triggerCreatePlan(Atom.Interrupt);
      setPlanningStatus("");
    };
  }, [
    existingPlan,
    triggerCreatePlan,
    triggerExecute,
    agentBackend,
    changesFor,
    skipPlanning,
    instruction,
    setScreen,
  ]);

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

  const awaitingApproval = !existingPlan && Boolean(testPlan) && !executionResult.waiting;

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
        usePlanStore.getState().setPlan(Plan.plan(testPlan!));
        if (testPlan!.requiresCookies) {
          setScreen(Screen.CookieSyncConfirm({ plan: testPlan! }));
        } else {
          setScreen(
            Screen.Testing({
              changesFor: testPlan!.changesFor,
              instruction: testPlan!.instruction,
              existingPlan: testPlan!,
            }),
          );
        }
        return;
      }
      if (key.escape || normalizedInput === "n") {
        goToMain();
        return;
      }
      return;
    }

    if (key.escape) {
      if (AsyncResult.isFailure(planResult) || AsyncResult.isFailure(executionResult)) {
        goToMain();
        return;
      }
      if (isPlanning || isExecutingPlan) {
        setShowCancelConfirmation(true);
        return;
      }
      if (executedPlan && report) {
        usePlanExecutionStore.getState().setExecutedPlan(executedPlan);
        setScreen(Screen.Results({ report }));
        return;
      }
      goToMain();
    }
  });

  const planToRender = executedPlan ?? testPlan;

  const completedCount = planToRender?.steps
    ? planToRender.steps.filter(
        (step: TestPlanStep) => step.status === "passed" || step.status === "failed",
      ).length
    : 0;
  const totalCount = planToRender?.steps ? planToRender.steps.length : 0;
  const currentActiveStep = planToRender?.steps?.find(
    (step: TestPlanStep) => step.status === "active",
  );
  const runStatusLabel = isPlanning
    ? "Planning"
    : currentActiveStep
      ? `Running ${currentActiveStep.title}`
      : completedCount === totalCount && totalCount > 0
        ? "Finishing up"
        : "Starting";

  const progressStateLabel = awaitingApproval
    ? "READY"
    : isPlanning
      ? "PLANNING"
      : isExecutingPlan
        ? "RUNNING"
        : "COMPLETE";
  const progressStateText = `${figures.bullet} ${progressStateLabel}`;
  const progressCountText = ` ${completedCount}/${totalCount} `;
  const elapsedTimeText = isExecutingPlan || isPlanning ? ` ${figures.pointerSmall} ${elapsedTimeLabel}` : "";
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
          <ScreenHeading
            title="Executing browser plan"
            subtitle={instruction}
            showDivider={false}
          />
        </Box>

        <Box marginTop={1} paddingX={1} alignItems="center">
          <Text bold color={COLORS.SELECTION}>
            {progressStateText}
          </Text>
          <Text> </Text>
          <Text backgroundColor={COLORS.SELECTION}>
            {" ".repeat(filledWidth)}
          </Text>
          <Text backgroundColor={COLORS.DIVIDER}>
            {" ".repeat(emptyWidth)}
          </Text>
          <Text> </Text>
          <Text backgroundColor={COLORS.DIVIDER} color={COLORS.TEXT}>
            {progressCountText}
          </Text>
          {elapsedTimeText ? <Text color={COLORS.DIM}>{elapsedTimeText}</Text> : null}
        </Box>

        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {(planToRender?.steps ?? []).map((step: TestPlanStep, stepIndex: number) => {
            const stepPrefix = `Step ${stepIndex + 1}`;
            const label = Option.isSome(step.summary) ? step.summary.value : step.title;
            const stepElapsedMs = getStepElapsedMs(step);
            const stepElapsedLabel =
              stepElapsedMs !== undefined ? formatElapsedTime(stepElapsedMs) : undefined;
            return (
              <Box key={step.id} flexDirection="column">
                {step.status === "passed" ? (
                  <Text color={COLORS.GREEN}>
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(
                      label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT,
                    )}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                ) : step.status === "failed" ? (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(
                      label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT,
                    )}${stepElapsedLabel ? ` ${stepElapsedLabel}` : ""}`}
                  </Text>
                ) : step.status === "active" ? (
                  <Box>
                    <Text>{"  "}</Text>
                    <Spinner />
                    <Text> </Text>
                    <TextShimmer
                      text={`${stepPrefix} ${step.title} ${formatElapsedTime(
                        Math.round(elapsedTimeMs),
                      )}`}
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
            <Text color={COLORS.DIM}>This will terminate the agent and close the browser.</Text>
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>Enter</Text> or{" "}
              <Text color={COLORS.PRIMARY}>y</Text> to stop, or{" "}
              <Text color={COLORS.PRIMARY}>Esc</Text> or <Text color={COLORS.PRIMARY}>n</Text> to
              keep it running.
            </Text>
          </RuledBox>
        ) : null}

        {(isExecutingPlan || isPlanning) && !showCancelConfirmation ? (
          <Box marginTop={1} paddingX={1} flexDirection="column">
            <TextShimmer
              text={`${runStatusLabel}${figures.ellipsis} ${elapsedTimeLabel}`}
              baseColor={COLORS.DIM}
              highlightColor={COLORS.PRIMARY}
            />
            {isPlanning && planningStatus && (
              <Text color={COLORS.DIM} wrap="truncate">
                {cliTruncate(
                  planningStatus.replaceAll("\n", " ").trim(),
                  TESTING_TOOL_TEXT_CHAR_LIMIT,
                )}
              </Text>
            )}
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
