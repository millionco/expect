import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Option } from "effect";
import type { TestReport } from "@browser-tester/supervisor";
import { copyToClipboard } from "../../utils/copy-to-clipboard.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import { Image } from "../ui/image.js";
import { Clickable } from "../ui/clickable.js";
import { usePostPrComment } from "../../data/github-mutations.js";

interface ResultsScreenProps {
  report: TestReport;
}

export const ResultsScreen = ({ report }: ResultsScreenProps) => {
  const COLORS = useColors();
  const [clipboardStatusMessage, setClipboardStatusMessage] = useState<
    string | undefined
  >(undefined);
  const [clipboardError, setClipboardError] = useState<string | undefined>(
    undefined
  );
  const commentMutation = usePostPrComment();

  const handlePostPullRequestComment = () => {
    if (!Option.isSome(report.pullRequest)) return;
    commentMutation.mutate({
      pullRequest: report.pullRequest.value,
      body: report.toPlainText,
    });
  };

  const handleCopyToClipboard = () => {
    setClipboardError(undefined);
    setClipboardStatusMessage(undefined);

    const didCopy = copyToClipboard(report.toPlainText);
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

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading
          title="Run results"
          subtitle={`${report.title} │ ${report.status.toUpperCase()}`}
        />
      </Box>

      <RuledBox
        color={report.status === "passed" ? COLORS.GREEN : COLORS.RED}
        marginTop={1}
      >
        <Text
          color={report.status === "passed" ? COLORS.GREEN : COLORS.RED}
          bold
        >
          {report.status === "passed" ? "Plan completed" : "Issues found"}
        </Text>
        <Text color={COLORS.TEXT}>{report.summary}</Text>
        {Option.isSome(report.pullRequest) ? (
          <Text color={COLORS.DIM}>
            PR: {report.pullRequest.value.title} (#
            {report.pullRequest.value.number})
          </Text>
        ) : null}
      </RuledBox>

      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Text color={COLORS.DIM} bold>
          STEP SUMMARY
        </Text>
        {report.steps.map((step) => (
          <Text
            key={step.id}
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
            <Text color={COLORS.TEXT}>{Option.getOrElse(step.summary, () => "no summary found")}</Text>
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Clickable onClick={handleCopyToClipboard}>
          <Text color={COLORS.DIM}>
            Press <Text color={COLORS.PRIMARY}>y</Text> to copy share details to
            the clipboard.
          </Text>
        </Clickable>
        {clipboardStatusMessage ? (
          <Text color={COLORS.GREEN}>{clipboardStatusMessage}</Text>
        ) : null}
        {clipboardError ? (
          <Text color={COLORS.RED}>{clipboardError}</Text>
        ) : null}
      </Box>

      {Option.isSome(report.pullRequest) ? (
        <Box flexDirection="column" paddingX={1}>
          <Clickable onClick={handlePostPullRequestComment}>
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>p</Text> to post this summary
              to the PR.
            </Text>
          </Clickable>
          {commentMutation.isPending ? (
            <Text color={COLORS.DIM}>Posting PR comment...</Text>
          ) : null}
          {commentMutation.isSuccess ? (
            <Text color={COLORS.GREEN}>Comment posted to PR.</Text>
          ) : null}
          {commentMutation.isError ? (
            <Text color={COLORS.RED}>Failed to post PR comment.</Text>
          ) : null}
        </Box>
      ) : null}

      {report.screenshotPaths.map((screenshotPath) => (
        <Box key={screenshotPath} paddingX={1}>
          <Image src={screenshotPath} alt={`Screenshot: ${screenshotPath}`} />
        </Box>
      ))}
    </Box>
  );
};
