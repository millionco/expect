import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Option } from "effect";
import { TestPlanDraft, ChangesFor, DraftId, type TestPlan } from "@browser-tester/supervisor";
import { Input } from "../ui/input.js";
import { useColors } from "../theme-context.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import { Clickable } from "../ui/clickable.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ContextPicker } from "../ui/context-picker.js";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import { changesForDisplayName } from "@browser-tester/shared/models";
import { usePlanStore, Plan } from "../../stores/use-plan-store.js";
import { useNavigationStore, Screen } from "../../stores/use-navigation.js";
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { useGitState } from "../../hooks/use-git-state.js";
import { useContextPicker } from "../../hooks/use-context-picker.js";

interface StepEditingState {
  kind: "step";
  stepIndex: number;
}

type EditingState = StepEditingState | null;

type RailSection = "info" | "steps";

type RailItem =
  | { kind: "details"; section: RailSection }
  | { kind: "step"; stepIndex: number; section: RailSection };

interface PlanReviewScreenProps {
  plan: TestPlan;
}

export const PlanReviewScreen = ({ plan }: PlanReviewScreenProps) => {
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();
  const setPlan = usePlanStore((state) => state.setPlan);
  const setScreen = useNavigationStore((state) => state.setScreen);
  const { data: gitState } = useGitState();
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingState, setEditingState] = useState<EditingState>(null);
  const [editingValue, setEditingValue] = useState("");
  const [exitConfirmationVisible, setExitConfirmationVisible] = useState(false);
  const [resubmitConfirmVisible, setResubmitConfirmVisible] = useState(false);

  const instruction = plan.instruction;
  const [topFocus, setTopFocus] = useState<"branch" | "input" | null>(null);
  const [inputValue, setInputValue] = useState(instruction);
  const inputFocused = topFocus === "input";
  const branchFocused = topFocus === "branch";

  const picker = useContextPicker({
    gitState: gitState ?? null,
    onSelect: () => {},
  });

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;

  const handleInputChange = useMemo(
    () => picker.createInputChangeHandler(inputValueRef, setInputValue),
    [picker],
  );

  const displayName = changesForDisplayName(plan.changesFor);

  const editingStep =
    editingState?.kind === "step" ? (plan.steps[editingState.stepIndex] ?? null) : null;
  const editingStepIndex = editingState?.kind === "step" ? editingState.stepIndex : null;

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

  useInput(
    (input, key) => {
      if (key.escape) {
        setEditingState(null);
        setEditingValue("");
      }
      if (key.return && !key.shift && editingStepIndex !== null && editingValue.trim()) {
        const updatedPlan = plan.updateStep(editingStepIndex, (step) =>
          step.update({ instruction: editingValue.trim() }),
        );
        setPlan(Plan.plan(updatedPlan));
        setEditingState(null);
        setEditingValue("");
      }
    },
    { isActive: Boolean(editingState) },
  );

  useInput(
    (input, key) => {
      if (input.toLowerCase() === "y") {
        const trimmedInput = inputValue.trim();
        const mainBranch = gitState?.mainBranch ?? "main";
        const draft = new TestPlanDraft({
          id: DraftId.makeUnsafe(crypto.randomUUID()),
          changesFor: ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch }),
          currentBranch: gitState?.currentBranch ?? "",
          diffPreview: "",
          fileStats: [],
          instruction: trimmedInput,
          baseUrl: Option.none(),
          isHeadless: false,
          requiresCookies: false,
        });
        const changesFor = ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch });
        usePreferencesStore.getState().rememberInstruction(trimmedInput);
        setPlan(Plan.draft(draft));
        setScreen(Screen.Testing({ changesFor, instruction: trimmedInput }));
      }
      if (input.toLowerCase() === "n" || key.escape) {
        setResubmitConfirmVisible(false);
        setInputValue(instruction);
      }
    },
    { isActive: resubmitConfirmVisible },
  );

  useInput(
    (input, key) => {
      if (input.toLowerCase() === "y") {
        setScreen(Screen.Main());
      }
      if (input.toLowerCase() === "n" || key.escape) setExitConfirmationVisible(false);
    },
    { isActive: exitConfirmationVisible },
  );

  useInput(
    (_input, key) => {
      if (inputFocused) {
        if (key.escape) {
          setTopFocus(null);
          setInputValue(instruction);
        }
        if ((key.shift && key.tab) || key.upArrow) setTopFocus("branch");
        if ((key.tab && !key.shift) || key.downArrow) setTopFocus(null);
      }
      if (branchFocused) {
        if (key.escape) setTopFocus(null);
        if ((key.tab && !key.shift) || key.downArrow) setTopFocus("input");
        if (key.return) navigateTo(Screen.SelectPr());
      }
    },
    { isActive: topFocus !== null && !resubmitConfirmVisible },
  );

  useInput(
    (input, key) => {
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

      if (key.shift && key.tab) setTopFocus("input");

      if (input === "e" && currentRailItem?.kind === "step") {
        const step = plan.steps[currentRailItem.stepIndex];
        if (step) {
          setEditingState({ kind: "step", stepIndex: currentRailItem.stepIndex });
          setEditingValue(step.instruction);
        }
      }

      if (input === "a" || key.return) {
        usePlanStore.getState().setPlan(Plan.plan(plan));
        if (plan.requiresCookies) {
          setScreen(Screen.CookieSyncConfirm({ plan }));
        } else {
          setScreen(Screen.Testing({ changesFor: plan.changesFor, instruction: plan.instruction }));
        }
      }
    },
    {
      isActive:
        !editingState && !resubmitConfirmVisible && !exitConfirmationVisible && !inputFocused,
    },
  );

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || trimmed === instruction) {
      setTopFocus(null);
      setInputValue(instruction);
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
                focus={inputFocused && !picker.pickerOpen}
                multiline
                value={inputValue}
                onSubmit={handleInputSubmit}
                onChange={handleInputChange}
              />
            </Box>
          ) : (
            <Text color={COLORS.DIM}>{instruction}</Text>
          )}
        </RuledBox>
      </Clickable>
      {inputFocused && picker.pickerOpen ? (
        <Box flexDirection="column">
          <Box marginBottom={0} paddingX={1}>
            <Text color={COLORS.DIM}>@ </Text>
            <Text color={COLORS.PRIMARY}>{picker.pickerQuery}</Text>
            <Text color={COLORS.DIM}>{picker.pickerQuery ? "" : "type to filter"}</Text>
          </Box>
          <ContextPicker
            options={picker.filteredOptions}
            selectedIndex={picker.pickerIndex}
            isLoading={picker.remoteLoading}
            query={picker.pickerQuery}
            gitState={gitState ?? null}
            onQueryChange={picker.setPickerQuery}
            onSelect={picker.handleContextSelect}
            onNavigate={picker.setPickerIndex}
            onDismiss={picker.closePicker}
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
                {instruction}
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
            {editingStep ? `Editing ${editingStep.id}` : "Editing"}
          </Text>
          <Box marginTop={0}>
            <Text color={COLORS.DIM}>/</Text>
            <Input
              focus
              value={editingValue}
              onChange={(nextValue) => setEditingValue(stripMouseSequences(nextValue))}
            />
          </Box>
        </Box>
      ) : null}

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
