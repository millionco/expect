import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useAppStore } from "../../store.js";
import {
  getRecommendedScope,
  type GitState,
} from "../../utils/get-git-state.js";
import type { TestAction } from "../../utils/browser-agent.js";
import { useColors } from "../theme-context.js";
import { Clickable } from "../ui/clickable.js";
import { Input } from "../ui/input.js";
import { ErrorMessage } from "../ui/error-message.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";

const getTestAction = (gitState: GitState): TestAction => {
  const scope = getRecommendedScope(gitState);
  if (scope === "unstaged-changes") return "test-unstaged";
  if (scope === "entire-branch") return "test-branch";
  return "test-unstaged";
};

export const MainMenu = () => {
  const COLORS = useColors();
  const gitState = useAppStore((state) => state.gitState);
  const autoRunAfterPlanning = useAppStore(
    (state) => state.autoRunAfterPlanning
  );
  const toggleAutoRun = useAppStore((state) => state.toggleAutoRun);
  const submitFlowInstruction = useAppStore(
    (state) => state.submitFlowInstruction
  );
  const selectAction = useAppStore((state) => state.selectAction);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const [value, setValue] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!gitState) return null;

  const testAction = getTestAction(gitState);
  const branchLabel = gitState.isOnMain
    ? gitState.currentBranch
    : `${gitState.currentBranch}`;
  const hasChanges =
    gitState.hasUnstagedChanges ||
    (!gitState.isOnMain && gitState.hasBranchCommits);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setErrorMessage("Describe what you want the browser agent to test.");
      return;
    }
    selectAction(testAction);
    submitFlowInstruction(trimmed);
  };

  useInput((_input, key) => {
    if (key.return && !key.shift) {
      submit();
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.TEXT}>
          browser-tester
        </Text>
        <Text color={COLORS.DIM}>
          {branchLabel}
          {hasChanges ? (
            <Text color={COLORS.PRIMARY}>{" · changes detected"}</Text>
          ) : null}
        </Text>
      </Box>

      <Text color={COLORS.DIM}>Describe what to test</Text>
      <Box
        marginTop={0}
        borderStyle="round"
        borderColor={COLORS.PRIMARY}
        paddingX={2}
      >
        <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
        <Input
          focus
          multiline
          placeholder="Go through onboarding, click Import Projects, verify the list appears..."
          value={value}
          onSubmit={submit}
          onChange={(nextValue) => {
            setValue(stripMouseSequences(nextValue));
            if (errorMessage) setErrorMessage(null);
          }}
        />
      </Box>

      <ErrorMessage message={errorMessage} />

      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.DIM}>
          Testing against{" "}
          <Text color={COLORS.TEXT} bold>
            {branchLabel}
          </Text>
          {" · "}
          <Clickable fullWidth={false} onClick={() => navigateTo("select-pr")}>
            <Text color={COLORS.PRIMARY}>switch branch/PR</Text>
          </Clickable>
        </Text>

        <Clickable onClick={toggleAutoRun}>
          <Text color={autoRunAfterPlanning ? COLORS.TEXT : COLORS.DIM}>
            auto-run after planning:{" "}
            <Text
              color={autoRunAfterPlanning ? COLORS.GREEN : COLORS.DIM}
              bold={autoRunAfterPlanning}
            >
              {autoRunAfterPlanning ? "yes" : "no"}
            </Text>
          </Text>
        </Clickable>
      </Box>
    </Box>
  );
};
