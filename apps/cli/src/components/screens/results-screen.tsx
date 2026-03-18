import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Effect, Option } from "effect";
import { Github, type TestReport } from "@browser-tester/supervisor";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";
import { copyToClipboard } from "../../utils/copy-to-clipboard.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import { Image } from "../ui/image.js";
import { Clickable } from "../ui/clickable.js";

const buildResultsClipboardText = (report: TestReport): string => {
  const clipboardLines = [`Status: ${report.status}`, `Summary: ${report.summary}`];

  report.steps.forEach((step) => {
    clipboardLines.push(`${step.status.toUpperCase()} ${step.title}: ${step.summary}`);
  });

  return clipboardLines.join("\n");
};

export const ResultsScreen = () => {
  const COLORS = useColors();
  const latestRunReport = useFlowSessionStore((state) => state.latestRunReport);
  const [clipboardStatusMessage, setClipboardStatusMessage] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentStatusMessage, setCommentStatusMessage] = useState<string | null>(null);

  const handlePostPullRequestComment = () => {
    if (!latestRunReport || !Option.isSome(latestRunReport.pullRequest)) return;
    setIsPostingComment(true);
    setCommentStatusMessage(null);
    const body = buildResultsClipboardText(latestRunReport);
    const pullRequest = latestRunReport.pullRequest.value;

    // HACK: Github.layer leaves `undefined` in R due to Effect v4 beta ServiceMap type inference
    Effect.runPromise(
      Github.use((github) => github.addComment(process.cwd(), pullRequest, body)).pipe(
        Effect.provide(Github.layer),
      ) as Effect.Effect<void>,
    )
      .then(() => setCommentStatusMessage("Comment posted to PR."))
      .catch(() => setCommentStatusMessage("Failed to post PR comment."))
      .finally(() => setIsPostingComment(false));
  };

  const handleCopyToClipboard = () => {
    if (!latestRunReport) {
      return;
    }

    setClipboardError(null);
    setClipboardStatusMessage(null);

    const didCopy = copyToClipboard(buildResultsClipboardText(latestRunReport));
    if (didCopy) {
      setClipboardStatusMessage("Copied share details to the clipboard.");
      return;
    }

    setClipboardError("Failed to copy share details to the clipboard.");
  };

  useInput((input) => {
    const normalizedInput = input.toLowerCase();

    if (normalizedInput === "y") {
      handleCopyToClipboard();
    }
    if (normalizedInput === "p") {
      handlePostPullRequestComment();
    }
  });

  if (!latestRunReport) return null;

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading title="Run results" subtitle={`${latestRunReport.status.toUpperCase()}`} />
      </Box>

      <RuledBox
        color={latestRunReport.status === "passed" ? COLORS.GREEN : COLORS.RED}
        marginTop={1}
      >
        <Text color={latestRunReport.status === "passed" ? COLORS.GREEN : COLORS.RED} bold>
          {latestRunReport.status === "passed" ? "Plan completed" : "Issues found"}
        </Text>
        <Text color={COLORS.TEXT}>{latestRunReport.summary}</Text>
      </RuledBox>

      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Text color={COLORS.DIM} bold>
          STEP SUMMARY
        </Text>
        {latestRunReport.steps.map((step) => (
          <Text
            key={step.stepId}
            color={
              step.status === "passed"
                ? COLORS.GREEN
                : step.status === "failed"
                  ? COLORS.RED
                  : COLORS.YELLOW
            }
          >
            {"• "}
            {step.title}
            {": "}
            <Text color={COLORS.TEXT}>{step.summary}</Text>
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Clickable onClick={handleCopyToClipboard}>
          <Text color={COLORS.DIM}>
            Press <Text color={COLORS.PRIMARY}>y</Text> to copy share details to the clipboard.
          </Text>
        </Clickable>
        {clipboardStatusMessage ? <Text color={COLORS.GREEN}>{clipboardStatusMessage}</Text> : null}
        {clipboardError ? <Text color={COLORS.RED}>{clipboardError}</Text> : null}
      </Box>

      {Option.isSome(latestRunReport.pullRequest) ? (
        <Box flexDirection="column" paddingX={1}>
          <Clickable onClick={handlePostPullRequestComment}>
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>p</Text> to post this summary to the PR.
            </Text>
          </Clickable>
          {isPostingComment ? <Text color={COLORS.DIM}>Posting PR comment...</Text> : null}
          {commentStatusMessage ? <Text color={COLORS.GREEN}>{commentStatusMessage}</Text> : null}
        </Box>
      ) : null}

      {latestRunReport.screenshotPaths.map((screenshotPath) => (
        <Box key={screenshotPath} paddingX={1}>
          <Image src={screenshotPath} alt={`Screenshot: ${screenshotPath}`} />
        </Box>
      ))}
    </Box>
  );
};
