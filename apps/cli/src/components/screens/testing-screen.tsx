import { Cause, Effect, Fiber, Stream } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { Agent } from "@browser-tester/agent";
import { ExecutedTestPlan, Executor, Reporter } from "@browser-tester/supervisor";
import {
  PROGRESS_BAR_WIDTH,
  TESTING_TIMER_UPDATE_INTERVAL_MS,
  TESTING_TOOL_TEXT_CHAR_LIMIT,
} from "../../constants.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { Spinner } from "../ui/spinner.js";
import { TextShimmer } from "../ui/text-shimmer.js";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { useGitState } from "../../hooks/use-git-state.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { Image } from "../ui/image.js";
import { ErrorMessage } from "../ui/error-message.js";
import { CliRuntime } from "../../runtime.js";

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
  const changesFor = useFlowSessionStore((state) => state.changesFor);
  const selectedCommit = useFlowSessionStore((state) => state.selectedCommit);
  const plan = useFlowSessionStore((state) => state.generatedPlan);
  const { data: gitState } = useGitState();
  const executionProvider = usePreferencesStore((state) => state.executionProvider);
  const completeTestingRun = useFlowSessionStore((state) => state.completeTestingRun);
  const exitTesting = useFlowSessionStore((state) => state.exitTesting);
  const COLORS = useColors();
  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | null>(null);
  const [stepStartTimesMs, setStepStartTimesMs] = useState<Map<string, number>>(new Map());
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [toolCallDisplayMode, setToolCallDisplayMode] = useState(TOOL_CALL_DISPLAY_MODE_COMPACT);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const runFiberRef = useRef<Fiber.Fiber<unknown, unknown> | null>(null);

  const elapsedTimeLabel = useMemo(() => formatElapsedTime(elapsedTimeMs), [elapsedTimeMs]);

  useEffect(() => {
    if (!exitRequested || running) return;
    exitTesting();
  }, [exitRequested, exitTesting, running]);

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

  const displayName = selectedCommit
    ? selectedCommit.shortHash
    : changesFor?._tag === "Branch" || changesFor?._tag === "Changes"
      ? (gitState?.currentBranch ?? "branch")
      : "working tree";

  useEffect(() => {
    if (!changesFor || !plan) return;

    const testPlan = plan;
    const startedAt = Date.now();
    setExecutedPlan(new ExecutedTestPlan({ ...testPlan, events: [] }));
    setStepStartTimesMs(new Map());
    setRunning(true);
    setError(null);
    setScreenshotPaths([]);
    setRunStartedAt(startedAt);
    setElapsedTimeMs(0);
    setShowCancelConfirmation(false);
    setExitRequested(false);
    useFlowSessionStore.setState({
      resolvedExecutionProvider: executionProvider ?? null,
    });

    const agentBackend = executionProvider === "claude" ? "claude" : "codex";

    runFiberRef.current = CliRuntime.runFork(
      Effect.gen(function* () {
        const executor = yield* Executor;
        // HACK: Effect v4 beta loses Stream element type through ServiceMap.Service inference
        const executionStream = (yield* executor.executePlan(
          testPlan,
        )) as Stream.Stream<ExecutedTestPlan>;

        const finalExecuted = yield* executionStream.pipe(
          Stream.tap((executed) =>
            Effect.sync(() => {
              const lastEvent = executed.events.at(-1);
              if (lastEvent?._tag === "ToolResult" && lastEvent.toolName.endsWith("__screenshot")) {
                setScreenshotPaths((previous) => [...previous, lastEvent.result]);
              }
              if (lastEvent?._tag === "StepStarted") {
                setStepStartTimesMs((previous) =>
                  new Map(previous).set(lastEvent.stepId, Date.now()),
                );
              }
              setExecutedPlan(executed);
            }),
          ),
          Stream.runLast,
          Effect.map((option) =>
            option._tag === "Some"
              ? option.value
              : new ExecutedTestPlan({ ...testPlan, events: [] }),
          ),
        );

        const report = yield* Reporter.use((reporter) => reporter.report(finalExecuted)).pipe(
          Effect.provide(Reporter.layer),
        );
        completeTestingRun(report);
      }).pipe(
        Effect.provide(Executor.layer),
        Effect.provide(Agent.layerFor(agentBackend)),
        Effect.scoped,
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.sync(() => setError(Cause.pretty(cause))),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            runFiberRef.current = null;
            setShowCancelConfirmation(false);
            setRunning(false);
          }),
        ),
      ),
    );

    return () => {
      const runFiber = runFiberRef.current;
      if (runFiber) {
        void Effect.runFork(Fiber.interrupt(runFiber));
      }
    };
  }, [completeTestingRun, executionProvider, plan, changesFor]);

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (exitRequested) {
      return;
    }

    if (showCancelConfirmation) {
      if (key.return || normalizedInput === "y") {
        setShowCancelConfirmation(false);
        setExitRequested(true);
        const runFiber = runFiberRef.current;
        if (runFiber) {
          void Effect.runFork(Fiber.interrupt(runFiber));
        }
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

      exitTesting();
    }
  });

  const activeStepId = useMemo(() => {
    if (!executedPlan) return null;
    let activeId: string | null = null;
    for (const event of executedPlan.events) {
      if (event._tag === "StepStarted") activeId = event.stepId;
      if (
        (event._tag === "StepCompleted" || event._tag === "StepFailed") &&
        activeId === event.stepId
      ) {
        activeId = null;
      }
    }
    return activeId;
  }, [executedPlan]);

  const currentToolCallText = useMemo(() => {
    if (!executedPlan || toolCallDisplayMode === TOOL_CALL_DISPLAY_MODE_HIDDEN) return null;
    const lastToolCall = executedPlan.events.findLast((event) => event._tag === "ToolCall");
    if (!lastToolCall || lastToolCall._tag !== "ToolCall") return null;
    const input = lastToolCall.input;
    if (input && typeof input === "object" && "command" in input) {
      return String((input as Record<string, unknown>).command).slice(0, 80);
    }
    return lastToolCall.toolName;
  }, [executedPlan, toolCallDisplayMode]);

  if (!changesFor || !plan || !executedPlan) return null;

  const report = executedPlan.testReport;
  const reportStepsById = new Map(report.steps.map((step) => [step.stepId, step]));

  const steps = plan.steps.map((step) => {
    const reportStep = reportStepsById.get(step.id);
    const isActive = step.id === activeStepId;
    const startTimeMs = stepStartTimesMs.get(step.id);
    const elapsedMs =
      startTimeMs !== undefined && runStartedAt !== null ? startTimeMs - runStartedAt : null;
    const status = isActive
      ? ("active" as const)
      : reportStep?.status === "not-run"
        ? ("pending" as const)
        : (reportStep?.status ?? ("pending" as const));
    const label =
      status === "pending" || status === "active" ? step.title : reportStep?.summary || step.title;
    return { stepId: step.id, status, label, elapsedMs };
  });

  const completedCount = steps.filter(
    (step) => step.status === "passed" || step.status === "failed",
  ).length;
  const totalCount = steps.length;
  const activeStep = steps.find((step) => step.status === "active");
  const runStatusLabel = activeStep
    ? `Running ${activeStep.label}`
    : completedCount === totalCount
      ? "Finishing up"
      : "Starting";

  const planTitle = plan.title;
  const filledWidth =
    totalCount > 0 ? Math.round((completedCount / totalCount) * PROGRESS_BAR_WIDTH) : 0;
  const emptyWidth = PROGRESS_BAR_WIDTH - filledWidth;

  return (
    <>
      <Static items={screenshotPaths}>
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
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(
                      step.label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT,
                    )}${step.elapsedMs !== null ? ` ${formatElapsedTime(step.elapsedMs)}` : ""}`}
                  </Text>
                ) : step.status === "failed" ? (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(
                      step.label,
                      TESTING_TOOL_TEXT_CHAR_LIMIT,
                    )}${step.elapsedMs !== null ? ` ${formatElapsedTime(step.elapsedMs)}` : ""}`}
                  </Text>
                ) : step.status === "active" ? (
                  <>
                    <Box>
                      <Text>{"  "}</Text>
                      <Spinner />
                      <Text> </Text>
                      <TextShimmer
                        text={`${stepPrefix} ${step.label} ${formatElapsedTime(
                          Math.round(elapsedTimeMs),
                        )}`}
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
              text={`${exitRequested ? "Stopping" : runStatusLabel}${
                figures.ellipsis
              } ${elapsedTimeLabel}`}
              baseColor={COLORS.DIM}
              highlightColor={COLORS.PRIMARY}
            />
          </Box>
        ) : null}

        {!running && !error ? (
          <Box marginTop={1} flexDirection="column" paddingX={1}>
            <Text color={COLORS.GREEN} bold>
              Done
            </Text>
          </Box>
        ) : null}

        <Box paddingX={1}>
          <ErrorMessage message={error ? `Error: ${error}` : null} />
        </Box>
      </Box>
    </>
  );
};
