import { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { Option } from "effect";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom } from "@effect/atom-react";
import type { TestReport } from "@expect/supervisor";
import type { TestPlanStep } from "@expect/shared/models";
import { copyToClipboard } from "../../utils/copy-to-clipboard";
import { trackEvent } from "../../utils/session-analytics";
import { useColors } from "../theme-context";
import { Logo } from "../ui/logo";
import { Image } from "../ui/image";
import { usePostPrComment } from "../../data/github-mutations";
import { useNavigationStore, screenForTestingOrPortPicker } from "../../stores/use-navigation";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store";
import { saveFlowFn } from "../../data/flow-storage-atom";
import { formatElapsedTime } from "../../utils/format-elapsed-time";
import { getStepElapsedMs, getTotalElapsedMs } from "../../utils/step-elapsed";

interface ResultsScreenProps {
  report: TestReport;
  replayUrl?: string;
  localReplayUrl?: string;
  videoUrl?: string;
}

export const ResultsScreen = ({
  report,
  replayUrl,
  localReplayUrl,
  videoUrl,
}: ResultsScreenProps) => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const [statusMessage, setStatusMessage] = useState<{ text: string; color: string } | undefined>(
    undefined,
  );
  const commentMutation = usePostPrComment();
  const [saveResult, triggerSave] = useAtom(saveFlowFn, { mode: "promiseExit" });

  const savePending = saveResult.waiting;
  const saveSucceeded = AsyncResult.isSuccess(saveResult);

  const handlePostPullRequestComment = () => {
    if (!Option.isSome(report.pullRequest)) return;
    trackEvent("results:posted_to_pr");
    commentMutation.mutate({
      pullRequest: report.pullRequest.value,
      body: report.toPlainText,
    });
  };

  const handleCopyToClipboard = () => {
    const didCopy = copyToClipboard(report.toPlainText);
    if (didCopy) {
      trackEvent("results:copied_to_clipboard");
      setStatusMessage({ text: `${figures.tick} Copied to clipboard`, color: COLORS.GREEN });
    } else {
      setStatusMessage({ text: `${figures.cross} Failed to copy to clipboard`, color: COLORS.RED });
    }
  };

  const handleSaveFlow = async () => {
    if (savePending || saveSucceeded) return;
    trackEvent("flow:saved", { step_count: report.steps.length });
    await triggerSave({ plan: report });
  };

  const handleRestartFlow = () => {
    trackEvent("results:restarted");
    usePlanExecutionStore.getState().setExecutedPlan(undefined);
    setScreen(
      screenForTestingOrPortPicker({
        changesFor: report.changesFor,
        instruction: report.instruction,
      }),
    );
  };

  useInput((input) => {
    const normalizedInput = input.toLowerCase();

    if (normalizedInput === "y") {
      handleCopyToClipboard();
    }
    if (normalizedInput === "p") {
      handlePostPullRequestComment();
    }
    if (normalizedInput === "s") {
      handleSaveFlow();
    }
    if (normalizedInput === "r") {
      handleRestartFlow();
    }
  });

  const isPassed = report.status === "passed";
  const statusColor = isPassed ? COLORS.GREEN : COLORS.RED;
  const statusIcon = isPassed ? figures.tick : figures.cross;
  const statusLabel = isPassed ? "Passed" : "Failed";
  const totalElapsedMs = getTotalElapsedMs(report.steps);
  const displayedReplayUrl = replayUrl ?? localReplayUrl;
  const showLocalReplayLine =
    Boolean(replayUrl) &&
    Boolean(localReplayUrl) &&
    replayUrl !== localReplayUrl &&
    localReplayUrl !== undefined;

  return (
    <Box flexDirection="column" width="100%" paddingY={1} paddingX={1}>
      <Box>
        <Logo />
        <Text wrap="truncate">
          {" "}
          <Text color={COLORS.DIM}>{figures.pointerSmall}</Text>{" "}
          <Text color={COLORS.TEXT}>{report.instruction}</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={statusColor} bold>
          {statusIcon} {statusLabel}
        </Text>
        {report.steps.length === 0 && (
          <Text color={COLORS.DIM}>{"  "}agent did not execute any test steps</Text>
        )}
        {report.steps.length > 0 && (
          <Text color={COLORS.DIM}>
            {"  "}
            {report.steps.length} step{report.steps.length === 1 ? "" : "s"}
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {report.steps.map((step: TestPlanStep, stepIndex: number) => {
          const stepElapsedMs = getStepElapsedMs(step);
          const stepElapsedLabel =
            stepElapsedMs !== undefined ? formatElapsedTime(stepElapsedMs) : undefined;
          const stepStatus = report.stepStatuses.get(step.id);
          const isFailed = stepStatus?.status === "failed";
          const isSkipped = stepStatus?.status === "skipped";
          const stepColor = isFailed ? COLORS.RED : isSkipped ? COLORS.YELLOW : COLORS.GREEN;
          const stepIcon = isFailed ? figures.cross : isSkipped ? figures.arrowRight : figures.tick;
          const num = `${stepIndex + 1}.`;

          return (
            <Box key={step.id} flexDirection="column">
              <Text>
                <Text color={COLORS.DIM}>
                  {"  "}
                  {num}
                </Text>
                <Text color={stepColor}>
                  {" "}
                  {stepIcon} {step.title}
                </Text>
                {stepElapsedLabel && <Text color={COLORS.DIM}> {stepElapsedLabel}</Text>}
              </Text>
              {(isFailed || isSkipped) && stepStatus?.summary && (
                <Text color={COLORS.DIM}>
                  {"     "}
                  {stepStatus.summary}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {totalElapsedMs > 0 && (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>Worked for {formatElapsedTime(totalElapsedMs)}</Text>
        </Box>
      )}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color={statusMessage.color}>{statusMessage.text}</Text>
        </Box>
      )}

      {commentMutation.isPending && (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>Posting to PR{figures.ellipsis}</Text>
        </Box>
      )}
      {commentMutation.isSuccess && (
        <Box marginTop={1}>
          <Text color={COLORS.GREEN}>{figures.tick} Posted to PR</Text>
        </Box>
      )}
      {commentMutation.isError && (
        <Box marginTop={1}>
          <Text color={COLORS.RED}>{figures.cross} Failed to post to PR</Text>
        </Box>
      )}

      {savePending && (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>Saving flow{figures.ellipsis}</Text>
        </Box>
      )}
      {saveSucceeded && (
        <Box marginTop={1}>
          <Text color={COLORS.GREEN}>{figures.tick} Flow saved</Text>
        </Box>
      )}
      {AsyncResult.isFailure(saveResult) && (
        <Box marginTop={1}>
          <Text color={COLORS.RED}>{figures.cross} Failed to save flow</Text>
        </Box>
      )}

      {displayedReplayUrl && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text color={COLORS.DIM}>
            Replay:{" "}
            <Text color={COLORS.PRIMARY} bold>
              {displayedReplayUrl}
            </Text>
          </Text>
        </Box>
      )}

      {showLocalReplayLine && (
        <Box flexDirection="column" paddingX={1}>
          <Text color={COLORS.DIM}>
            Local Replay:{" "}
            <Text color={COLORS.PRIMARY} bold>
              {localReplayUrl}
            </Text>
          </Text>
        </Box>
      )}

      {videoUrl && (
        <Box flexDirection="column" paddingX={1}>
          <Text color={COLORS.DIM}>
            Video:{" "}
            <Text color={COLORS.PRIMARY} bold>
              {videoUrl}
            </Text>
          </Text>
        </Box>
      )}

      {report.screenshotPaths.map((screenshotPath) => (
        <Box key={screenshotPath} marginTop={1}>
          <Image src={screenshotPath} alt={`Screenshot: ${screenshotPath}`} />
        </Box>
      ))}
    </Box>
  );
};
