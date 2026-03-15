import { useEffect, useState } from "react";
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
import { FLOW_PRESETS } from "../../constants.js";

const getTestAction = (gitState: GitState): TestAction => {
  const scope = getRecommendedScope(gitState);
  if (scope === "unstaged-changes") return "test-unstaged";
  if (scope === "entire-branch") return "test-branch";
  return "test-unstaged";
};

type FocusArea = "branch" | "input" | "auto-run";

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
  const checkedOutBranch = useAppStore((state) => state.checkedOutBranch);
  const [value, setValue] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusArea>(
    checkedOutBranch ? "input" : "branch"
  );

  useEffect(() => {
    if (checkedOutBranch) setFocus("input");
  }, [checkedOutBranch]);

  if (!gitState) return null;

  const testAction = getTestAction(gitState);
  const branchLabel = checkedOutBranch ?? gitState.currentBranch;
  const hasChanges =
    gitState.hasUnstagedChanges ||
    (!gitState.isOnMain && gitState.hasBranchCommits);

  const submit = (submittedValue?: string) => {
    const trimmed = (submittedValue ?? value).trim();
    if (!trimmed) {
      setErrorMessage("Describe what you want the browser agent to test.");
      return;
    }
    selectAction(testAction);
    submitFlowInstruction(trimmed);
  };

  const showSuggestion =
    focus === "input" && value === "" && FLOW_PRESETS.length > 0;
  const currentSuggestion = FLOW_PRESETS[suggestionIndex % FLOW_PRESETS.length];

  useInput(
    (_input, key) => {
      if (focus === "branch") {
        if (key.downArrow) {
          setFocus("input");
          return;
        }
        if (key.return) {
          navigateTo("select-pr");
          return;
        }
      }
      if (focus === "auto-run") {
        if (key.upArrow) {
          setFocus("input");
          return;
        }
        if (key.return) {
          toggleAutoRun();
          return;
        }
      }
    },
    { isActive: focus !== "input" }
  );

  useInput(
    (_input, key) => {
      if (!showSuggestion) return;
      if (key.rightArrow) {
        setSuggestionIndex((previous) => (previous + 1) % FLOW_PRESETS.length);
        return;
      }
      if (key.leftArrow) {
        setSuggestionIndex(
          (previous) =>
            (previous - 1 + FLOW_PRESETS.length) % FLOW_PRESETS.length
        );
        return;
      }
      if (key.tab && currentSuggestion) {
        setValue(currentSuggestion);
      }
    },
    { isActive: focus === "input" }
  );

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.TEXT}>
          browser-tester
        </Text>
        {hasChanges ? (
          <Text color={COLORS.PRIMARY}>changes detected</Text>
        ) : null}
      </Box>

      <Text color={COLORS.DIM}>Branch / PR</Text>
      <Clickable onClick={() => navigateTo("select-pr")}>
        <Box
          borderStyle="round"
          borderColor={focus === "branch" ? COLORS.PRIMARY : COLORS.BORDER}
          paddingX={2}
        >
          <Text
            color={focus === "branch" ? COLORS.PRIMARY : COLORS.TEXT}
            bold={focus === "branch"}
          >
            {branchLabel}
          </Text>
          <Text color={COLORS.DIM}>{" · press enter to change"}</Text>
        </Box>
      </Clickable>

      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.DIM}>Describe what to test</Text>
        <Box
          borderStyle="round"
          borderColor={focus === "input" ? COLORS.PRIMARY : COLORS.BORDER}
          paddingX={2}
        >
          <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
          <Input
            focus={focus === "input"}
            multiline
            placeholder="Go through onboarding, click Import Projects, verify the list appears..."
            value={value}
            onSubmit={submit}
            onUpArrowAtTop={() => setFocus("branch")}
            onDownArrowAtBottom={() => setFocus("auto-run")}
            onChange={(nextValue) => {
              setValue(stripMouseSequences(nextValue));
              if (errorMessage) setErrorMessage(null);
            }}
          />
        </Box>
      </Box>

      {showSuggestion ? (
        <Box marginTop={0}>
          <Text color={COLORS.DIM}>
            {"  "}tab <Text color={COLORS.TEXT}>{currentSuggestion}</Text>
            {"  "}
            <Text color={COLORS.DIM}>←→ cycle</Text>
          </Text>
        </Box>
      ) : null}

      <ErrorMessage message={errorMessage} />

      <Box marginTop={1} flexDirection="column">
        <Clickable onClick={toggleAutoRun}>
          <Text color={focus === "auto-run" ? COLORS.PRIMARY : COLORS.DIM}>
            {focus === "auto-run" ? "▸ " : "  "}
            <Text bold={focus === "auto-run"}>auto-run after planning: </Text>
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
