import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { Effect, Option, Ref, Stream } from "effect";
import type {
  ChangesFor,
  ExecutedTestPlan,
  TestPlanStep,
} from "@expect/shared/models";
import type { WatchEvent } from "@expect/supervisor";
import { Watch } from "@expect/supervisor";
import { useMountEffect } from "../../hooks/use-mount-effect";
import { TESTING_TIMER_UPDATE_INTERVAL_MS, TESTING_TOOL_TEXT_CHAR_LIMIT } from "../../constants";
import { useColors, theme } from "../theme-context";
import { Spinner } from "../ui/spinner";
import { TextShimmer } from "../ui/text-shimmer";
import { Logo } from "../ui/logo";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import cliTruncate from "cli-truncate";
import { formatElapsedTime } from "../../utils/format-elapsed-time";
import { sendWatchNotification } from "../../utils/watch-notifications";
import { layerCli } from "../../layers";
import { stripUndefinedRequirement } from "../../utils/strip-undefined-requirement";

interface WatchScreenProps {
  changesFor: ChangesFor;
  instruction: string;
  cookieBrowserKeys?: readonly string[];
  baseUrl?: string;
}

type WatchPhase = "polling" | "settling" | "assessing" | "running" | "idle" | "error";

export const WatchScreen = ({
  changesFor,
  instruction,
  cookieBrowserKeys = [],
  baseUrl,
}: WatchScreenProps) => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const browserHeaded = usePreferencesStore((state) => state.browserHeaded);
  const notifications = usePreferencesStore((state) => state.notifications);

  const [phase, setPhase] = useState<WatchPhase>("polling");
  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [runCount, setRunCount] = useState(0);
  const [lastResult, setLastResult] = useState<"passed" | "failed" | undefined>(undefined);
  const [runStartedAt, setRunStartedAt] = useState<number | undefined>(undefined);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useMountEffect(() => {
    const abortController = new AbortController();
    abortRef.current = abortController;

    const handleEvent = (event: WatchEvent) => {
      if (abortController.signal.aborted) return;

      switch (event._tag) {
        case "Polling":
          setPhase("polling");
          break;
        case "ChangeDetected":
          setPhase("settling");
          break;
        case "Settling":
          setPhase("settling");
          break;
        case "Assessing":
          setPhase("assessing");
          break;
        case "RunStarting":
          setPhase("running");
          setRunStartedAt(Date.now());
          setExecutedPlan(undefined);
          break;
        case "RunUpdate":
          setExecutedPlan(event.executedPlan);
          break;
        case "RunCompleted": {
          setPhase("idle");
          setRunCount((previous) => previous + 1);
          setExecutedPlan(event.executedPlan);
          const steps = event.executedPlan.steps ?? [];
          const hasFailed = steps.some((step) => step.status === "failed");
          setLastResult(hasFailed ? "failed" : "passed");
          setRunStartedAt(undefined);
          if (notifications) {
            sendWatchNotification(event);
          }
          break;
        }
        case "Skipped":
          setPhase("idle");
          break;
        case "Error":
          setPhase("error");
          setLastError(String(event.error));
          setRunStartedAt(undefined);
          if (notifications) {
            sendWatchNotification(event);
          }
          break;
        case "Stopped":
          break;
      }
    };

    const program = Effect.gen(function* () {
      const watch = yield* Watch;
      const { loop } = yield* watch.run({
        changesFor,
        instruction,
        isHeadless: !browserHeaded,
        cookieBrowserKeys: [...cookieBrowserKeys],
        baseUrl,
        onEvent: handleEvent,
      });
      yield* loop;
    }).pipe(
      Effect.provide(layerCli({ verbose: false, agent: agentBackend })),
    );

    Effect.runPromise(
      stripUndefinedRequirement(program),
    ).catch((error) => {
      if (!abortController.signal.aborted) {
        setPhase("error");
        setLastError(String(error));
      }
    });

    return () => {
      abortController.abort();
    };
  });

  useEffect(() => {
    if (runStartedAt === undefined) return;
    if (phase !== "running") return;
    const interval = setInterval(() => {
      setElapsedTimeMs(Date.now() - runStartedAt);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runStartedAt, phase]);

  const goToMain = () => {
    abortRef.current?.abort();
    setScreen(Screen.Main());
  };

  useInput((input, key) => {
    if (showStopConfirmation) {
      if (key.return || input.toLowerCase() === "y") {
        setShowStopConfirmation(false);
        goToMain();
        return;
      }
      if (key.escape || input.toLowerCase() === "n") {
        setShowStopConfirmation(false);
      }
      return;
    }

    if (key.escape) {
      setShowStopConfirmation(true);
    }
  });

  const elapsedTimeLabel = formatElapsedTime(elapsedTimeMs);
  const steps = executedPlan?.steps ?? [];

  const phaseLabel = (() => {
    switch (phase) {
      case "polling":
        return "Watching for changes";
      case "settling":
        return "Changes detected, waiting for edits to finish";
      case "assessing":
        return "Assessing changes";
      case "running":
        return `Running tests ${elapsedTimeLabel}`;
      case "idle":
        return "Watching for changes";
      case "error":
        return "Error occurred, will retry";
    }
  })();

  const isActive = phase === "running" || phase === "assessing" || phase === "settling";

  return (
    <Box flexDirection="column" width="100%" paddingY={1} paddingX={1}>
      <Box>
        <Logo />
        <Text wrap="truncate">
          {" "}
          <Text color={COLORS.DIM}>{figures.pointerSmall}</Text>{" "}
          <Text color={COLORS.TEXT}>watch: {instruction}</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        {isActive && (
          <Box>
            <Spinner />
            <Text> </Text>
            <TextShimmer
              text={phaseLabel}
              baseColor={theme.shimmerBase}
              highlightColor={theme.shimmerHighlight}
            />
          </Box>
        )}
        {!isActive && (
          <Text color={COLORS.DIM}>
            {figures.bullet} {phaseLabel}
          </Text>
        )}
      </Box>

      {runCount > 0 && (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>
            Runs: {runCount}
            {lastResult && (
              <>
                {" "}
                {figures.bullet} Last:{" "}
                <Text color={lastResult === "passed" ? COLORS.GREEN : COLORS.RED}>
                  {lastResult}
                </Text>
              </>
            )}
          </Text>
        </Box>
      )}

      {phase === "running" && steps.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {steps.map((step: TestPlanStep, stepIndex: number) => {
            const label = Option.isSome(step.summary) ? step.summary.value : step.title;
            const num = `${stepIndex + 1}.`;

            if (step.status === "active") {
              return (
                <Box key={step.id}>
                  <Text color={COLORS.DIM}>
                    {"  "}
                    {num}{" "}
                  </Text>
                  <Spinner />
                  <Text> </Text>
                  <TextShimmer
                    text={step.title}
                    baseColor={theme.shimmerBase}
                    highlightColor={theme.shimmerHighlight}
                  />
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
      )}

      {lastError && phase === "error" && (
        <Box marginTop={1}>
          <Text color={COLORS.RED}>
            {figures.cross} {lastError}
          </Text>
        </Box>
      )}

      {showStopConfirmation && (
        <Box marginTop={1}>
          <Text color={COLORS.YELLOW}>
            Stop watch mode? <Text color={COLORS.PRIMARY}>enter</Text> to stop,{" "}
            <Text color={COLORS.PRIMARY}>esc</Text> to dismiss
          </Text>
        </Box>
      )}
    </Box>
  );
};
