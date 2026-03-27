import { useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import figures from "figures";
import cliTruncate from "cli-truncate";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import * as Atom from "effect/unstable/reactivity/Atom";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { Cause, Effect, Exit } from "effect";
import type { ChangesFor, ExecutedTestPlan, SavedFlow } from "@expect/shared/models";
import {
  type TestReport,
  type WatchDecision,
  type WatchEvent,
  Watch,
  changesForDisplayName,
} from "@expect/supervisor";
import { executeFn, screenshotPathsAtom } from "../../data/execution-atom";
import { useColors } from "../theme-context";
import { usePreferencesStore } from "../../stores/use-preferences";
import { Screen, useNavigationStore } from "../../stores/use-navigation";
import { trackEvent } from "../../utils/session-analytics";
import { Logo } from "../ui/logo";
import { Spinner } from "../ui/spinner";
import { Image } from "../ui/image";
import { ErrorMessage, InlineError } from "../ui/error-message";
import { RuledBox } from "../ui/ruled-box";
import { layerCli } from "../../layers";
import { stripUndefinedRequirement } from "../../utils/strip-undefined-requirement";
import { useMountEffect } from "../../hooks/use-mount-effect";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import { sendWatchIssueNotification } from "../../utils/watch-notifications";

interface WatchScreenProps {
  readonly changesFor: ChangesFor;
  readonly instruction: string;
  readonly savedFlow?: SavedFlow;
  readonly requiresCookies?: boolean;
  readonly baseUrls?: readonly string[];
}

const MAX_EVENT_HISTORY = 6;
const EVENT_SUMMARY_PREFIX = ": ";
const EVENT_SUMMARY_WIDTH_PADDING = 10;

const summarizeReport = (report: TestReport): string => {
  const passedCount = report.steps.filter(
    (step) => report.stepStatuses.get(step.id)?.status === "passed",
  ).length;
  const failedCount = report.steps.filter(
    (step) => report.stepStatuses.get(step.id)?.status === "failed",
  ).length;
  const skippedCount = report.steps.filter(
    (step) => report.stepStatuses.get(step.id)?.status === "skipped",
  ).length;

  const parts = [`${passedCount} passed`, `${failedCount} failed`];
  if (skippedCount > 0) {
    parts.push(`${skippedCount} skipped`);
  }
  return parts.join(", ");
};

const appendWatchEvent = (
  events: readonly WatchEvent[],
  nextEvent: WatchEvent,
): readonly WatchEvent[] => [...events.slice(-(MAX_EVENT_HISTORY - 1)), nextEvent];

const splitEventMessage = (message: string) => {
  const separatorIndex = message.indexOf(EVENT_SUMMARY_PREFIX);
  if (separatorIndex === -1) {
    return { summary: message, detail: undefined } as const;
  }

  return {
    summary: message.slice(0, separatorIndex),
    detail: message.slice(separatorIndex + EVENT_SUMMARY_PREFIX.length),
  } as const;
};

const formatWatchEvent = (
  event: WatchEvent,
): {
  readonly icon: string;
  readonly color: string;
  readonly summary: string;
  readonly detail?: string;
} => {
  const { summary, detail } = splitEventMessage(event.message);

  switch (event._tag) {
    case "WatchStarted":
      return {
        icon: figures.bullet,
        color: "dim",
        summary: "Watching for changes",
      };
    case "ChangeDetected":
      return {
        icon: figures.warning,
        color: "yellow",
        summary: "Changes detected",
        detail,
      };
    case "Decision":
      return {
        icon: summary.startsWith("Running") ? figures.pointer : figures.arrowRight,
        color: summary.startsWith("Running") ? "primary" : "yellow",
        summary: summary.startsWith("Running")
          ? "Decision: run browser test"
          : "Decision: skip browser test",
        detail,
      };
    case "RunStarted":
      return {
        icon: figures.play,
        color: "primary",
        summary: "Run started",
        detail: event.message.replace(/^Starting browser test\s*/i, "").trim(),
      };
    case "RunCompleted": {
      const passed = event.message.toLowerCase().includes("passed");
      return {
        icon: passed ? figures.tick : figures.cross,
        color: passed ? "green" : "red",
        summary: passed ? "Run passed" : "Run failed",
      };
    }
    case "RerunQueued":
      return {
        icon: figures.arrowRight,
        color: "yellow",
        summary: "Queued rerun",
        detail,
      };
  }
};

export const WatchScreen = ({
  changesFor,
  instruction,
  savedFlow,
  requiresCookies = false,
  baseUrls,
}: WatchScreenProps) => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const browserHeaded = usePreferencesStore((state) => state.browserHeaded);
  const replayHost = usePreferencesStore((state) => state.replayHost);
  const notifications = usePreferencesStore((state) => state.notifications);
  const toggleNotifications = usePreferencesStore((state) => state.toggleNotifications);
  const [columns] = useStdoutDimensions();
  const [executionResult, triggerExecute] = useAtom(executeFn, {
    mode: "promiseExit",
  });
  const screenshotPaths = useAtomValue(screenshotPathsAtom);
  const [executedPlan, setExecutedPlan] = useState<ExecutedTestPlan | undefined>(undefined);
  const [liveReplayUrl, setLiveReplayUrl] = useState<string | undefined>(undefined);
  const [watchEvents, setWatchEvents] = useState<readonly WatchEvent[]>([]);
  const [lastDecision, setLastDecision] = useState<WatchDecision | undefined>(undefined);
  const [lastReport, setLastReport] = useState<TestReport | undefined>(undefined);
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [watchErrorMessage, setWatchErrorMessage] = useState<string | undefined>(undefined);
  const [runCount, setRunCount] = useState(0);
  const activeRef = useRef(true);

  const isExecuting = AsyncResult.isWaiting(executionResult);
  const latestToolCall = executedPlan?.lastToolCallDisplayText;
  const baseUrl = baseUrls && baseUrls.length > 0 ? baseUrls.join(", ") : undefined;
  const urlTags = baseUrls ? baseUrls.map((url) => `[url: ${url}]`).join(" ") : undefined;
  const instructionWithUrls = urlTags ? `${instruction} ${urlTags}` : instruction;

  const goToMain = () => {
    activeRef.current = false;
    setShowStopConfirmation(false);
    void triggerExecute(Atom.Interrupt);
    setScreen(Screen.Main());
  };

  useMountEffect(() => {
    activeRef.current = true;

    void Effect.runPromise(
      stripUndefinedRequirement(
        Effect.gen(function* () {
          const watch = yield* Watch;
          return yield* watch.watch({
            changesFor,
            userInstruction: instruction,
            pollIntervalMs: 1_500,
            settleDelayMs: 2_000,
            shouldContinue: () => activeRef.current,
            onEvent: (event) => {
              if (!activeRef.current) return;
              setWatchEvents((previous) => appendWatchEvent(previous, event));
            },
            execute: async (input) => {
              if (!activeRef.current) {
                return {
                  status: "failed",
                  message: "Watch session stopped.",
                };
              }

              setRunCount((previous) => previous + 1);
              setExecutedPlan(undefined);
              setLiveReplayUrl(undefined);
              setLastDecision(input.decision);
              setWatchErrorMessage(undefined);

              try {
                const exit = await triggerExecute({
                  options: {
                    changesFor: input.changesFor,
                    instruction: instructionWithUrls,
                    isHeadless: !browserHeaded,
                    requiresCookies,
                    savedFlow,
                    baseUrl,
                  },
                  agentBackend,
                  replayHost,
                  onUpdate: (plan) => {
                    if (!activeRef.current) return;
                    setExecutedPlan(plan);
                  },
                  onReplayUrl: (url) => {
                    if (!activeRef.current) return;
                    setLiveReplayUrl(url);
                  },
                });

                if (Exit.isFailure(exit)) {
                  const message = Cause.pretty(exit.cause);
                  if (activeRef.current) {
                    setWatchErrorMessage(message);
                  }
                  await sendWatchIssueNotification(message);
                  return {
                    status: "failed",
                    message,
                  };
                }

                const result = exit.value;

                if (!activeRef.current) {
                  return {
                    status: result.report.status,
                    message: result.report.summary,
                  };
                }

                setLastReport(result.report);
                if (result.report.status === "failed") {
                  await sendWatchIssueNotification(result.report.summary);
                }

                return {
                  status: result.report.status,
                  message: result.report.summary,
                };
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (activeRef.current) {
                  setWatchErrorMessage(message);
                }
                await sendWatchIssueNotification(message);
                return {
                  status: "failed",
                  message,
                };
              }
            },
          });
        }).pipe(Effect.provide(layerCli({ verbose: true, agent: agentBackend }))),
      ),
    ).catch((error) => {
      if (!activeRef.current) return;
      setWatchErrorMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      activeRef.current = false;
      void triggerExecute(Atom.Interrupt);
    };
  });

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (showStopConfirmation) {
      if (key.return || normalizedInput === "y") {
        goToMain();
        return;
      }
      if (key.escape || normalizedInput === "n") {
        setShowStopConfirmation(false);
      }
      return;
    }

    if (normalizedInput === "o" && !key.ctrl && !key.meta && liveReplayUrl) {
      const { exec } = require("node:child_process") as typeof import("node:child_process");
      exec(`open "${liveReplayUrl.replace(/"/g, '\\"')}"`);
      trackEvent("live_preview:opened");
      return;
    }

    if (key.ctrl && input === "n") {
      toggleNotifications();
      return;
    }

    if (key.escape) {
      setShowStopConfirmation(true);
    }
  });

  const executionStateLabel = isExecuting
    ? `Run ${runCount} in progress`
    : `Watching ${changesForDisplayName(changesFor)}`;
  const executionStateColor = isExecuting ? COLORS.YELLOW : COLORS.GREEN;
  const recentEvents = [...watchEvents].reverse();
  const eventTextWidth = Math.max(20, columns - EVENT_SUMMARY_WIDTH_PADDING);

  return (
    <>
      <Static items={[...screenshotPaths]}>
        {(screenshotPath) => (
          <Box key={screenshotPath} paddingX={1}>
            <Image src={screenshotPath} alt={screenshotPath} />
          </Box>
        )}
      </Static>
      <Box flexDirection="column" width="100%" paddingY={1} paddingX={1}>
        <Box>
          <Logo />
          <Text wrap="truncate">
            {" "}
            <Text color={COLORS.DIM}>{figures.pointerSmall}</Text>{" "}
            <Text color={COLORS.TEXT}>{instruction}</Text>
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color={executionStateColor} bold>
            {isExecuting ? figures.pointer : figures.bullet} {executionStateLabel}
          </Text>
          <Text color={COLORS.DIM}>
            Scope: <Text color={COLORS.PRIMARY}>{changesForDisplayName(changesFor)}</Text>
          </Text>
          {lastDecision && (
            <Text color={COLORS.DIM}>
              Last decision:{" "}
              <Text color={lastDecision.shouldRun ? COLORS.GREEN : COLORS.YELLOW}>
                {lastDecision.shouldRun ? "run" : "skip"}
              </Text>{" "}
              ({lastDecision.source}) - {lastDecision.reason}
            </Text>
          )}
          {lastReport && !isExecuting && (
            <Text color={lastReport.status === "passed" ? COLORS.GREEN : COLORS.RED}>
              Last result: {lastReport.status.toUpperCase()} - {summarizeReport(lastReport)}
            </Text>
          )}
          {liveReplayUrl && isExecuting && (
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>o</Text> to open live preview
            </Text>
          )}
          <Text color={COLORS.DIM}>
            Notifications:{" "}
            <Text color={notifications === true ? COLORS.GREEN : COLORS.DIM}>
              {notifications === true ? "on" : "off"}
            </Text>
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {isExecuting && !executedPlan && (
            <Spinner message="Waiting for the next watched run to start" />
          )}
          {executedPlan?.steps.map((step, stepIndex) => {
            const color =
              step.status === "passed"
                ? COLORS.GREEN
                : step.status === "failed"
                  ? COLORS.RED
                  : step.status === "skipped"
                    ? COLORS.YELLOW
                    : step.status === "active"
                      ? COLORS.PRIMARY
                      : COLORS.DIM;
            const icon =
              step.status === "passed"
                ? figures.tick
                : step.status === "failed"
                  ? figures.cross
                  : step.status === "skipped"
                    ? figures.arrowRight
                    : step.status === "active"
                      ? figures.pointer
                      : figures.circle;
            const summary = step.summary._tag === "Some" ? step.summary.value : undefined;

            return (
              <Box key={step.id} flexDirection="column">
                <Text color={color}>
                  {"  "}
                  {stepIndex + 1}. {icon} {summary ?? step.title}
                </Text>
                {step.status === "active" && latestToolCall && (
                  <Text color={COLORS.DIM}> {latestToolCall}</Text>
                )}
              </Box>
            );
          })}
        </Box>

        {recentEvents.length > 0 && (
          <RuledBox color={COLORS.BORDER} marginTop={1}>
            <Text color={COLORS.DIM}>Recent watch events</Text>
            <Box flexDirection="column" marginTop={1}>
              {recentEvents.map((event, index) => {
                const formatted = formatWatchEvent(event);
                const summaryColor =
                  formatted.color === "green"
                    ? COLORS.GREEN
                    : formatted.color === "red"
                      ? COLORS.RED
                      : formatted.color === "yellow"
                        ? COLORS.YELLOW
                        : formatted.color === "primary"
                          ? COLORS.PRIMARY
                          : COLORS.DIM;

                return (
                  <Box
                    key={`${event._tag}-${index}`}
                    flexDirection="column"
                    marginBottom={index === recentEvents.length - 1 ? 0 : 1}
                  >
                    <Text color={summaryColor} wrap="truncate">
                      {formatted.icon} {cliTruncate(formatted.summary, eventTextWidth)}
                    </Text>
                    {formatted.detail && (
                      <Text color={COLORS.DIM} wrap="truncate">
                        {"  "}
                        {cliTruncate(formatted.detail, eventTextWidth)}
                      </Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          </RuledBox>
        )}

        {showStopConfirmation && (
          <Box marginTop={1}>
            <Text color={COLORS.YELLOW}>
              Stop watching? <Text color={COLORS.PRIMARY}>enter</Text> to stop,{" "}
              <Text color={COLORS.PRIMARY}>esc</Text> to dismiss
            </Text>
          </Box>
        )}

        <InlineError message={watchErrorMessage} />

        {AsyncResult.builder(executionResult)
          .onError((error) => <ErrorMessage type="error" error={error} />)
          .orNull()}
      </Box>
    </>
  );
};
