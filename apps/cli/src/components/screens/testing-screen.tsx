import { Cause, Effect, Fiber, Stream } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import { executeBrowserFlow, type BrowserRunEvent } from "@browser-tester/supervisor";
import {
  LIVE_VIEW_READY_POLL_INTERVAL_MS,
  PROGRESS_BAR_WIDTH,
  TESTING_TIMER_UPDATE_INTERVAL_MS,
  TESTING_TOOL_TEXT_CHAR_LIMIT,
} from "../../constants";
import { useColors } from "../theme-context";
import { RuledBox } from "../ui/ruled-box";
import { Spinner } from "../ui/spinner";
import { TextShimmer } from "../ui/text-shimmer";
import { useFlowSessionStore } from "../../stores/use-flow-session";
import { usePreferencesStore } from "../../stores/use-preferences";
import { ScreenHeading } from "../ui/screen-heading";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time";
import { extractScreenshotPath } from "../../utils/extract-screenshot-path";
import { Image } from "../ui/image";
import { ErrorMessage } from "../ui/error-message";
import { deriveTestingState, saveTestedFingerprint } from "@browser-tester/supervisor";
import { openUrl } from "../../utils/open-url";

const LIVE_VIEW_SHORTCUT_KEY = "o";

export const TestingScreen = () => {
  const target = useFlowSessionStore((state) => state.resolvedTarget);
  const flowInstruction = useFlowSessionStore((state) => state.flowInstruction);
  const pendingSavedFlow = useFlowSessionStore((state) => state.pendingSavedFlow);
  const environment = useFlowSessionStore((state) => state.browserEnvironment);
  const executionProvider = usePreferencesStore((state) => state.executionProvider);
  const executionModel = usePreferencesStore((state) => state.executionModel);
  const completeTestingRun = useFlowSessionStore((state) => state.completeTestingRun);
  const exitTesting = useFlowSessionStore((state) => state.exitTesting);
  const liveViewUrl = useFlowSessionStore((state) => state.liveViewUrl);
  const setLiveViewUrl = useFlowSessionStore((state) => state.setLiveViewUrl);
  const COLORS = useColors();
  const [events, setEvents] = useState<BrowserRunEvent[]>([]);
  const collectedEventsRef = useRef<BrowserRunEvent[]>([]);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [pendingLiveViewUrl, setPendingLiveViewUrl] = useState<string | null>(null);
  const runFiberRef = useRef<Fiber.Fiber<unknown, unknown> | null>(null);

  const derivedState = useMemo(
    () => (events.length > 0 ? deriveTestingState(events, "hidden") : null),
    [events],
  );

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

  useEffect(() => {
    if (!pendingLiveViewUrl) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(pendingLiveViewUrl);
        if (response.ok && !cancelled) {
          setLiveViewUrl(pendingLiveViewUrl);
          clearInterval(interval);
        }
      } catch {
        // HACK: server not ready yet, keep polling
      }
    }, LIVE_VIEW_READY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingLiveViewUrl, setLiveViewUrl]);

  useEffect(() => {
    if (!target || !flowInstruction || !environment) return;

    const startedAt = Date.now();
    setEvents([]);
    collectedEventsRef.current = [];
    setRunning(true);
    setError(null);
    setScreenshotPaths([]);
    setRunStartedAt(startedAt);
    setElapsedTimeMs(0);
    setShowCancelConfirmation(false);
    setExitRequested(false);
    useFlowSessionStore.setState({ resolvedExecutionProvider: executionProvider ?? null });
    runFiberRef.current = Effect.runFork(
      Stream.runForEach(
        executeBrowserFlow({
          target,
          userInstruction: flowInstruction,
          environment,
          savedFlow: pendingSavedFlow ?? undefined,
          provider: executionProvider,
          ...(executionModel ? { providerSettings: { model: executionModel } } : {}),
        }),
        (event) =>
          Effect.sync(() => {
            if (event.type === "run-started" && event.liveViewUrl) {
              setPendingLiveViewUrl(event.liveViewUrl);
            }
            if (event.type === "run-completed") {
              if (event.report) {
                if (event.report.status === "passed") {
                  saveTestedFingerprint();
                }
                completeTestingRun(event.report, collectedEventsRef.current);
              }
            }
            if (event.type === "tool-result") {
              const screenshotPath = extractScreenshotPath(event);
              if (screenshotPath) {
                setScreenshotPaths((previous) => [...previous, screenshotPath]);
              }
            }
            collectedEventsRef.current = [...collectedEventsRef.current, event];
            setEvents(collectedEventsRef.current);
          }),
      ).pipe(
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
  }, [
    completeTestingRun,
    environment,
    executionModel,
    executionProvider,
    flowInstruction,
    pendingSavedFlow,
    setLiveViewUrl,
    target,
  ]);

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

    if (normalizedInput === LIVE_VIEW_SHORTCUT_KEY && liveViewUrl) {
      openUrl(liveViewUrl);
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

  if (!target || !flowInstruction || !environment) return null;

  const { steps, completedCount, totalCount, runStatusLabel } = derivedState ?? {
    steps: [],
    completedCount: 0,
    totalCount: 0,
    runStatusLabel: "Testing",
  };
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
            subtitle={`${flowInstruction} │ ${target.displayName}`}
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
                    {`  ${figures.tick} ${stepPrefix} ${cliTruncate(step.label, TESTING_TOOL_TEXT_CHAR_LIMIT)}${step.elapsedMs !== null ? ` ${formatElapsedTime(step.elapsedMs)}` : ""}`}
                  </Text>
                ) : step.status === "failed" ? (
                  <Text color={COLORS.RED}>
                    {`  ${figures.cross} ${stepPrefix} ${cliTruncate(step.label, TESTING_TOOL_TEXT_CHAR_LIMIT)}${step.elapsedMs !== null ? ` ${formatElapsedTime(step.elapsedMs)}` : ""}`}
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
              text={`${exitRequested ? "Stopping" : runStatusLabel}${figures.ellipsis} ${elapsedTimeLabel}`}
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
