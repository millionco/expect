import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Input } from "../ui/input.js";
import { useColors } from "../theme-context.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import { Clickable } from "../ui/clickable.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ContextPicker } from "../ui/context-picker.js";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import { TestPlan, TestPlanStep } from "@browser-tester/supervisor";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";
import { useNavigationStore } from "../../stores/use-navigation.js";
import { useGitState } from "../../hooks/use-git-state.js";
import { ErrorMessage } from "../ui/error-message.js";
import {
  buildLocalContextOptions,
  fetchRemoteContextOptions,
  filterContextOptions,
  type ContextOption,
} from "../../utils/context-options.js";

interface StepEditingState {
  kind: "step";
  stepIndex: number;
}

interface AssumptionsEditingState {
  kind: "assumptions";
}

type EditingState = StepEditingState | AssumptionsEditingState | null;

export const PlanReviewScreen = () => {
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();
  const plan = useFlowSessionStore((state) => state.generatedPlan);
  const changesFor = useFlowSessionStore((state) => state.changesFor);
  const selectedCommit = useFlowSessionStore((state) => state.selectedCommit);
  const goBack = useFlowSessionStore((state) => state.goBack);
  const updatePlan = useFlowSessionStore((state) => state.updatePlan);
  const requestPlanApproval = useFlowSessionStore((state) => state.requestPlanApproval);
  const flowInstruction = useFlowSessionStore((state) => state.flowInstruction);
  const storeSelectContext = useFlowSessionStore((state) => state.selectContext);
  const { data: gitState } = useGitState();
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const selectChangesFor = useFlowSessionStore((state) => state.selectChangesFor);
  const submitFlowInstruction = useFlowSessionStore((state) => state.submitFlowInstruction);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingState, setEditingState] = useState<EditingState>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exitConfirmationVisible, setExitConfirmationVisible] = useState(false);
  const [topFocus, setTopFocus] = useState<"branch" | "input" | null>(null);
  const [inputValue, setInputValue] = useState(flowInstruction);
  const [resubmitConfirmVisible, setResubmitConfirmVisible] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const [localOptions, setLocalOptions] = useState<ContextOption[]>([]);
  const [remoteOptions, setRemoteOptions] = useState<ContextOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const inputFocused = topFocus === "input";
  const branchFocused = topFocus === "branch";

  useEffect(() => {
    if (!pickerOpen || !gitState) return;
    let cancelled = false;
    buildLocalContextOptions(gitState)
      .then((options) => {
        if (!cancelled) setLocalOptions(options);
      })
      .catch(() => {});
    setRemoteLoading(true);
    fetchRemoteContextOptions(gitState)
      .then((options) => {
        if (!cancelled) setRemoteOptions(options);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, gitState]);

  const allOptions = useMemo(
    () => [...localOptions, ...remoteOptions],
    [localOptions, remoteOptions],
  );

  const filteredOptions = useMemo(
    () => filterContextOptions(allOptions, pickerQuery),
    [allOptions, pickerQuery],
  );

  useEffect(() => {
    setPickerIndex(0);
  }, [pickerQuery]);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerQuery("");
    setPickerIndex(0);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerQuery("");
  }, []);

  const handleContextSelect = useCallback(
    (option: ContextOption) => {
      storeSelectContext(option);
      closePicker();
    },
    [storeSelectContext, closePicker],
  );

  const handleInputChange = useCallback(
    (nextValue: string) => {
      const stripped = stripMouseSequences(nextValue);

      if (
        stripped.length > inputValue.length &&
        stripped[stripped.length - 1] === "@" &&
        (inputValue.length === 0 || stripped[stripped.length - 2] === " ")
      ) {
        setInputValue(stripped.slice(0, -1));
        openPicker();
        return;
      }

      if (pickerOpen) {
        const afterAt = stripped.length - inputValue.length;
        if (afterAt < 0) {
          closePicker();
          setInputValue(stripped);
        } else {
          setPickerQuery((previous) => {
            const added = stripped.slice(inputValue.length);
            if (added.includes(" ")) {
              closePicker();
              setInputValue(stripped);
              return "";
            }
            return previous + added;
          });
        }
        return;
      }

      setInputValue(stripped);
    },
    [inputValue, pickerOpen, openPicker, closePicker],
  );

  if (!plan) return null;

  const displayName = selectedCommit
    ? selectedCommit.shortHash
    : changesFor?._tag === "Branch" || changesFor?._tag === "Changes"
      ? (gitState?.currentBranch ?? "branch")
      : "working tree";

  const editingStep =
    editingState?.kind === "step" ? (plan.steps[editingState.stepIndex] ?? null) : null;
  const editingStepIndex = editingState?.kind === "step" ? editingState.stepIndex : null;
  const editingAssumptions = false;

  type RailSection = "info" | "steps";

  type RailItem =
    | { kind: "details"; section: RailSection }
    | { kind: "step"; stepIndex: number; section: RailSection };

  const railItems: RailItem[] = useMemo(() => {
    const result: RailItem[] = [];
    result.push({ kind: "details", section: "info" });
    plan.steps.forEach((_, index) => {
      result.push({ kind: "step", stepIndex: index, section: "steps" });
    });
    return result;
  }, [plan]);

  const totalItems = railItems.length;
  const currentRailItem = railItems[selectedIndex];
  const firstStepIndex = railItems.findIndex((item) => item.kind === "step");

  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  useEffect(() => {
    if (hasInitializedSelection || firstStepIndex < 0) return;
    setSelectedIndex(firstStepIndex);
    setHasInitializedSelection(true);
  }, [firstStepIndex, hasInitializedSelection]);

  useInput((input, key) => {
    if (editingState) {
      if (key.escape) {
        setEditingState(null);
        setEditingValue("");
      }

      if (key.return && !key.shift && editingStep && editingValue.trim()) {
        updatePlan(
          new TestPlan({
            ...plan,
            steps: plan.steps.map((step, index) =>
              index === editingStepIndex
                ? new TestPlanStep({ ...step, instruction: editingValue.trim() })
                : step,
            ),
          }),
        );
        setEditingState(null);
        setEditingValue("");
      }

      return;
    }

    if (resubmitConfirmVisible) {
      if (input.toLowerCase() === "y" && changesFor) {
        selectChangesFor(changesFor);
        submitFlowInstruction(inputValue.trim());
      }
      if (input.toLowerCase() === "n" || key.escape) {
        setResubmitConfirmVisible(false);
        setInputValue(flowInstruction);
      }
      return;
    }

    if (exitConfirmationVisible) {
      if (input.toLowerCase() === "y") {
        goBack();
      }

      if (input.toLowerCase() === "n" || key.escape) {
        setExitConfirmationVisible(false);
      }

      return;
    }

    if (inputFocused) {
      return;
    }

    if (key.escape) {
      setExitConfirmationVisible(true);
      return;
    }

    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(totalItems - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      if (selectedIndex === 0) {
        setTopFocus("input");
      } else {
        setSelectedIndex((previous) => Math.max(0, previous - 1));
      }
    }

    if (key.shift && key.tab) {
      setTopFocus("input");
    }

    if (input === "e" && currentRailItem?.kind === "step") {
      const step = plan.steps[currentRailItem.stepIndex];
      if (step) {
        setEditingState({ kind: "step", stepIndex: currentRailItem.stepIndex });
        setEditingValue(step.instruction);
      }
    }

    if (input === "s") {
      setSaveError("Flow saving is not available.");
    }
    if (input === "a" || key.return) {
      requestPlanApproval();
    }
  });

  useInput(
    (_input, key) => {
      if (inputFocused) {
        if (key.escape) {
          setTopFocus(null);
          setInputValue(flowInstruction);
        }
        if ((key.shift && key.tab) || key.upArrow) {
          setTopFocus("branch");
        }
        if ((key.tab && !key.shift) || key.downArrow) {
          setTopFocus(null);
        }
      }
      if (branchFocused) {
        if (key.escape) {
          setTopFocus(null);
        }
        if ((key.tab && !key.shift) || key.downArrow) {
          setTopFocus("input");
        }
        if (key.return) {
          navigateTo("select-pr");
        }
      }
    },
    { isActive: topFocus !== null && !resubmitConfirmVisible },
  );

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || trimmed === flowInstruction) {
      setTopFocus(null);
      setInputValue(flowInstruction);
      return;
    }
    setResubmitConfirmVisible(true);
  };

  const railColor = COLORS.BORDER;

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Clickable onClick={() => setTopFocus("input")}>
        <RuledBox color={inputFocused ? COLORS.PRIMARY : COLORS.BORDER}>
          {inputFocused ? (
            <Box>
              <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
              <Input
                focus={inputFocused && !pickerOpen}
                multiline
                value={inputValue}
                onSubmit={handleInputSubmit}
                onChange={handleInputChange}
              />
            </Box>
          ) : (
            <Text color={COLORS.DIM}>{flowInstruction}</Text>
          )}
        </RuledBox>
      </Clickable>
      {inputFocused && pickerOpen ? (
        <Box flexDirection="column">
          <Box marginBottom={0} paddingX={1}>
            <Text color={COLORS.DIM}>@ </Text>
            <Text color={COLORS.PRIMARY}>{pickerQuery}</Text>
            <Text color={COLORS.DIM}>{pickerQuery ? "" : "type to filter"}</Text>
          </Box>
          <ContextPicker
            options={filteredOptions}
            selectedIndex={pickerIndex}
            isLoading={remoteLoading}
            query={pickerQuery}
            onQueryChange={setPickerQuery}
            onSelect={handleContextSelect}
            onNavigate={setPickerIndex}
            onDismiss={closePicker}
          />
        </Box>
      ) : null}

      {resubmitConfirmVisible ? (
        <RuledBox color={COLORS.YELLOW} marginTop={1}>
          <Text color={COLORS.YELLOW} bold>
            Re-generate plan with new description?
          </Text>
          <Text color={COLORS.DIM}>
            {" "}
            Press <Text color={COLORS.PRIMARY}>y</Text> to submit or{" "}
            <Text color={COLORS.PRIMARY}>n</Text> to cancel.
          </Text>
        </RuledBox>
      ) : null}

      {!inputFocused ? (
        <Box flexDirection="column" paddingX={1}>
          <Text color={COLORS.BORDER}>
            <Text bold color={COLORS.TEXT}>
              BROWSER TEST PLAN
            </Text>{" "}
            {"─".repeat(Math.max(0, columns - 20))}
          </Text>

          <Box marginTop={1}>
            <Text color={railColor}>{"┌  "}</Text>
            <Box flexShrink={1}>
              <Text color={COLORS.TEXT} wrap="wrap">
                {flowInstruction}
              </Text>
            </Box>
          </Box>

          <Box>
            <Text color={railColor}>{"│  "}</Text>
            <Text color={COLORS.DIM}>{displayName}</Text>
          </Box>

          <Text color={railColor}>{"│"}</Text>

          {railItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const isLast = index === railItems.length - 1;
            const continuation = isLast ? " " : "│";
            const previousItem = index > 0 ? railItems[index - 1] : null;
            const sectionBreak = previousItem !== null && previousItem.section !== item.section;

            if (item.kind === "details") {
              return (
                <Box key="details" flexDirection="column">
                  <Clickable onClick={() => setSelectedIndex(index)}>
                    <Box>
                      <Text color={isSelected ? COLORS.PRIMARY : railColor}>
                        {isSelected ? "◆" : "◇"}{" "}
                      </Text>
                      <Text color={isSelected ? COLORS.PRIMARY : COLORS.TEXT} bold={isSelected}>
                        Details
                      </Text>
                    </Box>
                  </Clickable>
                  {isSelected ? (
                    <Box flexDirection="column">
                      {plan.rationale ? (
                        <Box>
                          <Text color={railColor}>{`${continuation}  `}</Text>
                          <Box flexShrink={1}>
                            <Text color={COLORS.DIM} wrap="wrap">
                              {plan.rationale}
                            </Text>
                          </Box>
                        </Box>
                      ) : null}
                    </Box>
                  ) : null}
                </Box>
              );
            }

            const step = plan.steps[item.stepIndex];
            return (
              <Box key={step.id} flexDirection="column">
                {sectionBreak ? (
                  <Box marginTop={1} marginBottom={1}>
                    <Text color={COLORS.BORDER}>
                      {"STEPS "}
                      {"─".repeat(Math.max(0, columns - 8))}
                    </Text>
                  </Box>
                ) : null}
                <Clickable onClick={() => setSelectedIndex(index)}>
                  <Box>
                    <Text color={isSelected ? COLORS.PRIMARY : railColor}>
                      {isSelected ? "◆" : "◇"}{" "}
                    </Text>
                    <Text color={isSelected ? COLORS.PRIMARY : COLORS.TEXT} bold={isSelected}>
                      {step.title}
                    </Text>
                  </Box>
                </Clickable>
                {isSelected ? (
                  <Box flexDirection="column">
                    <Text color={railColor}>
                      {`${continuation}  `}
                      <Text color={COLORS.DIM}>ACTION</Text>
                    </Text>
                    <Box>
                      <Text color={railColor}>{`${continuation}  `}</Text>
                      <Box flexShrink={1}>
                        <Text color={COLORS.TEXT} wrap="wrap">
                          {step.instruction}
                        </Text>
                      </Box>
                    </Box>
                    <Text color={railColor}>{`${continuation}`}</Text>
                    <Text color={railColor}>
                      {`${continuation}  `}
                      <Text color={COLORS.DIM}>EXPECTED</Text>
                    </Text>
                    <Box>
                      <Text color={railColor}>{`${continuation}  `}</Text>
                      <Box flexShrink={1}>
                        <Text color={COLORS.GREEN} wrap="wrap">
                          {step.expectedOutcome}
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
      ) : null}

      {editingState ? (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold color={COLORS.YELLOW}>
            {editingStep ? `Editing ${editingStep.id}` : "Editing assumptions"}
          </Text>
          {editingAssumptions ? (
            <Text color={COLORS.DIM}>
              One line per assumption or note. Shift+Enter adds a newline.
            </Text>
          ) : null}
          <Box marginTop={0}>
            <Text color={COLORS.DIM}>/</Text>
            <Input
              focus
              multiline={editingAssumptions}
              value={editingValue}
              onChange={(nextValue) => setEditingValue(stripMouseSequences(nextValue))}
            />
          </Box>
        </Box>
      ) : null}

      <Box paddingX={1}>
        <ErrorMessage message={saveError} />
      </Box>

      {exitConfirmationVisible ? (
        <RuledBox color={COLORS.YELLOW} marginTop={1}>
          <Text color={COLORS.YELLOW} bold>
            Leave plan review?
          </Text>
          <Text color={COLORS.DIM}>
            You have not started this run yet. Press <Text color={COLORS.PRIMARY}>y</Text> to leave
            or <Text color={COLORS.PRIMARY}>n</Text> to stay here.
          </Text>
        </RuledBox>
      ) : null}
    </Box>
  );
};
