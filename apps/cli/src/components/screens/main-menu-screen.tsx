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
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const hasExistingInput = flowInstruction.length > 0;
  const [value, setValue] = useState(flowInstruction);
  const [inputKey, setInputKey] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusArea>(
    hasExistingInput || checkedOutBranch ? "input" : "branch"
  );

  useEffect(() => {
    if (checkedOutBranch) setFocus("input");
  }, [checkedOutBranch]);

  if (!gitState) return null;

  const testAction = getTestAction(gitState);
  const branchLabel = checkedOutBranch ?? gitState.currentBranch;
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

  const focusAreas: FocusArea[] = ["branch", "input", "auto-run"];
  const focusNext = () => {
    const currentIndex = focusAreas.indexOf(focus);
    const next = focusAreas[currentIndex + 1];
    if (next) setFocus(next);
  };
  const focusPrevious = () => {
    const currentIndex = focusAreas.indexOf(focus);
    const previous = focusAreas[currentIndex - 1];
    if (previous) setFocus(previous);
  };

  useInput(
    (input, key) => {
      if (
        (key.tab && !key.shift) ||
        (key.ctrl && input === "n") ||
        key.downArrow
      ) {
        focusNext();
        return;
      }
      if (
        (key.tab && key.shift) ||
        (key.ctrl && input === "p") ||
        key.upArrow
      ) {
        focusPrevious();
        return;
      }

      if (focus === "branch") {
        if (key.return) {
          navigateTo("select-pr");
          return;
        }
      }
      if (focus === "auto-run") {
        if (key.return) {
          toggleAutoRun();
          return;
        }
      }
    },
    { isActive: focus !== "input" }
  );

  useInput(
    (input, key) => {
      if (key.tab && !key.shift && showSuggestion && currentSuggestion) {
        setValue(currentSuggestion);
        setInputKey((previous) => previous + 1);
        return;
      }
      if ((key.tab && !key.shift) || (key.ctrl && input === "n")) {
        focusNext();
        return;
      }
      if ((key.tab && key.shift) || (key.ctrl && input === "p")) {
        focusPrevious();
        return;
      }
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
    },
    { isActive: focus === "input" }
  );

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={COLORS.TEXT}>
          browser-tester
        </Text>
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
            key={inputKey}
            focus={focus === "input"}
            multiline
            placeholder={`${
              currentSuggestion ?? "Describe what to test..."
            }  [tab]`}
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
        <Text color={COLORS.DIM}>
          {"  ←→ cycle suggestions "}[
          {(suggestionIndex % FLOW_PRESETS.length) + 1}/{FLOW_PRESETS.length}]
        </Text>
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
