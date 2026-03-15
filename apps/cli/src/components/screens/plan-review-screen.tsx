import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Input } from "../ui/input.js";
import { useColors } from "../theme-context.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import { Clickable } from "../ui/clickable.js";
import { Collapsible } from "../ui/collapsible.js";
import { saveFlow } from "../../utils/save-flow.js";
import { useAppStore } from "../../store.js";
import { ErrorMessage } from "../ui/error-message.js";
import type { BrowserFlowPlan } from "@browser-tester/supervisor";

type Section = "details" | "assumptions" | "cookies" | "steps";

interface SectionItem {
  kind: "section";
  section: Section;
}

interface StepItem {
  kind: "step";
  stepIndex: number;
}

type NavigableItem = SectionItem | StepItem;

interface StepEditingState {
  kind: "step";
  stepIndex: number;
}

interface AssumptionsEditingState {
  kind: "assumptions";
}

type EditingState = StepEditingState | AssumptionsEditingState | null;

interface PlanStepRowProps {
  step: BrowserFlowPlan["steps"][number];
  selected: boolean;
  onClick: () => void;
}

const PlanStepRow = ({ step, selected, onClick }: PlanStepRowProps) => {
  const COLORS = useColors();
  const bullet = selected ? "●" : "○";

  return (
    <Clickable onClick={onClick}>
      <Text>
        <Text color={selected ? COLORS.PRIMARY : COLORS.DIM}>{bullet} </Text>
        <Text color={selected ? COLORS.PRIMARY : COLORS.TEXT} bold={selected}>
          {step.title}
        </Text>
      </Text>
    </Clickable>
  );
};

interface StepPreviewProps {
  step: BrowserFlowPlan["steps"][number];
  stepNumber: number;
  totalSteps: number;
}

const StepPreview = ({ step, stepNumber, totalSteps }: StepPreviewProps) => {
  const COLORS = useColors();

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={COLORS.PRIMARY}
      paddingX={2}
    >
      <Text color={COLORS.PRIMARY} bold>
        Step {stepNumber}/{totalSteps} — {step.title}
      </Text>
      <Text color={COLORS.TEXT}>{step.instruction}</Text>
      <Box marginTop={1}>
        <Text color={COLORS.DIM}>
          {"expected "}
          <Text color={COLORS.GREEN}>{step.expectedOutcome}</Text>
        </Text>
      </Box>
    </Box>
  );
};

export const PlanReviewScreen = () => {
  const COLORS = useColors();
  const plan = useAppStore((state) => state.generatedPlan);
  const environment = useAppStore((state) => state.browserEnvironment);
  const resolvedTarget = useAppStore((state) => state.resolvedTarget);
  const goBack = useAppStore((state) => state.goBack);
  const updatePlan = useAppStore((state) => state.updatePlan);
  const updateEnvironment = useAppStore((state) => state.updateEnvironment);
  const requestPlanApproval = useAppStore((state) => state.requestPlanApproval);
  const loadSavedFlows = useAppStore((state) => state.loadSavedFlows);
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const gitState = useAppStore((state) => state.gitState);
  const checkedOutBranch = useAppStore((state) => state.checkedOutBranch);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const selectAction = useAppStore((state) => state.selectAction);
  const submitFlowInstruction = useAppStore(
    (state) => state.submitFlowInstruction
  );
  const testAction = useAppStore((state) => state.testAction);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    details: true,
    assumptions: true,
  });
  const [editingState, setEditingState] = useState<EditingState>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exitConfirmationVisible, setExitConfirmationVisible] = useState(false);
  const [topFocus, setTopFocus] = useState<"branch" | "input" | null>(null);
  const [inputValue, setInputValue] = useState(flowInstruction);
  const [resubmitConfirmVisible, setResubmitConfirmVisible] = useState(false);
  const inputFocused = topFocus === "input";
  const branchFocused = topFocus === "branch";

  if (!plan || !resolvedTarget) return null;

  const editingStep =
    editingState?.kind === "step"
      ? plan.steps[editingState.stepIndex] ?? null
      : null;
  const editingStepIndex =
    editingState?.kind === "step" ? editingState.stepIndex : null;
  const editingAssumptions = editingState?.kind === "assumptions";
  const cookiesEnabled = (environment ?? {}).cookies === true;
  const cookieSyncIsRequired = plan.cookieSync.required;
  const cookieSyncNeedsAttention = cookieSyncIsRequired && !cookiesEnabled;

  const items: NavigableItem[] = useMemo(() => {
    const result: NavigableItem[] = [];
    result.push({ kind: "section", section: "details" });
    if (cookieSyncIsRequired) {
      result.push({ kind: "section", section: "cookies" });
    }
    if (plan.assumptions.length > 0) {
      result.push({ kind: "section", section: "assumptions" });
    }
    result.push({ kind: "section", section: "steps" });
    if (!collapsed["steps"]) {
      plan.steps.forEach((_, index) => {
        result.push({ kind: "step", stepIndex: index });
      });
    }
    return result;
  }, [cookieSyncIsRequired, plan, collapsed]);

  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  useEffect(() => {
    if (hasInitializedSelection) return;
    const firstStepIndex = items.findIndex(
      (item) => item.kind === "step" && item.stepIndex === 0
    );
    if (firstStepIndex >= 0) {
      setSelectedIndex(firstStepIndex);
      setHasInitializedSelection(true);
    }
  }, [items, hasInitializedSelection]);

  const currentItem = items[selectedIndex];

  const toggleSection = (section: Section) => {
    setCollapsed((previous) => ({
      ...previous,
      [section]: !previous[section],
    }));
  };

  useInput((input, key) => {
    if (editingState) {
      if (key.escape) {
        setEditingState(null);
        setEditingValue("");
      }

      if (key.return && !key.shift && editingStep && editingValue.trim()) {
        updatePlan({
          ...plan,
          steps: plan.steps.map((step, index) =>
            index === editingStepIndex
              ? { ...step, instruction: editingValue.trim() }
              : step
          ),
        });
        setEditingState(null);
        setEditingValue("");
      }

      if (key.return && !key.shift && editingAssumptions) {
        updatePlan({
          ...plan,
          assumptions: editingValue
            .split("\n")
            .map((assumption) => assumption.trim())
            .filter(Boolean),
        });
        setEditingState(null);
        setEditingValue("");
      }

      return;
    }

    if (resubmitConfirmVisible) {
      if (input.toLowerCase() === "y" && testAction) {
        selectAction(testAction);
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
      setSelectedIndex((previous) => Math.min(items.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      if (selectedIndex === 0) {
        setTopFocus("input");
      } else {
        setSelectedIndex((previous) => Math.max(0, previous - 1));
      }
    }

    if (key.tab && !key.shift && currentItem?.kind === "section") {
      toggleSection(currentItem.section);
    }
    if (key.shift && key.tab) {
      setTopFocus("input");
    }

    if (input === "e" && currentItem?.kind === "step") {
      const step = plan.steps[currentItem.stepIndex];
      if (step) {
        setEditingState({ kind: "step", stepIndex: currentItem.stepIndex });
        setEditingValue(step.instruction);
      }
    }

    if (
      input === "e" &&
      currentItem?.kind === "section" &&
      currentItem.section === "assumptions"
    ) {
      setEditingState({ kind: "assumptions" });
      setEditingValue(plan.assumptions.join("\n"));
    }

    if (input === "c" && cookieSyncIsRequired) {
      updateEnvironment({
        ...(environment ?? {}),
        cookies: !cookiesEnabled,
      });
    }
    if (input === "s" && !saving) {
      setSaveError(null);
      setSaveMessage(null);
      setSaving(true);
      void saveFlow({
        target: resolvedTarget,
        plan,
        environment: environment ?? {},
      })
        .then((result) => {
          setSaveMessage(
            `Saved ${result.flowPath} and updated ${result.directoryPath}`
          );
          void loadSavedFlows();
        })
        .catch((caughtError) => {
          setSaveError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to save flow."
          );
        })
        .finally(() => {
          setSaving(false);
        });
    }
    if (input === "a") {
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
    { isActive: topFocus !== null && !resubmitConfirmVisible }
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

  const isSectionSelected = (section: Section) =>
    currentItem?.kind === "section" && currentItem.section === section;

  const branchLabel = checkedOutBranch ?? gitState?.currentBranch ?? "unknown";

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Text color={COLORS.DIM} dimColor={inputFocused}>
        {"Branch / PR"}
      </Text>
      <Clickable onClick={() => navigateTo("select-pr")}>
        <Box
          borderStyle="round"
          borderColor={branchFocused ? COLORS.PRIMARY : COLORS.BORDER}
          paddingX={2}
        >
          <Text
            color={branchFocused ? COLORS.PRIMARY : COLORS.TEXT}
            bold={branchFocused}
          >
            {branchLabel}
          </Text>
          <Text color={COLORS.DIM}>{" · press enter to change"}</Text>
        </Box>
      </Clickable>

      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.DIM}>Describe what to test</Text>
        <Clickable onClick={() => setTopFocus("input")}>
          <Box
            borderStyle="round"
            borderColor={inputFocused ? COLORS.PRIMARY : COLORS.BORDER}
            paddingX={2}
          >
            {inputFocused ? (
              <>
                <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
                <Input
                  focus
                  multiline
                  value={inputValue}
                  onSubmit={handleInputSubmit}
                  onChange={(nextValue) =>
                    setInputValue(stripMouseSequences(nextValue))
                  }
                />
              </>
            ) : (
              <Text color={COLORS.DIM}>{flowInstruction}</Text>
            )}
          </Box>
        </Clickable>
      </Box>

      {resubmitConfirmVisible ? (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor={COLORS.YELLOW}
          paddingX={1}
        >
          <Text color={COLORS.YELLOW} bold>
            Re-generate plan with new description?
          </Text>
          <Text color={COLORS.DIM}>
            {" "}
            Press <Text color={COLORS.PRIMARY}>y</Text> to submit or{" "}
            <Text color={COLORS.PRIMARY}>n</Text> to cancel.
          </Text>
        </Box>
      ) : null}

      {cookieSyncIsRequired ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={cookieSyncNeedsAttention ? COLORS.RED : COLORS.YELLOW}
          paddingX={1}
        >
          <Text
            color={cookieSyncNeedsAttention ? COLORS.RED : COLORS.YELLOW}
            bold
          >
            {cookieSyncNeedsAttention
              ? "Cookie sync is required and currently off."
              : "Cookie sync is enabled for this plan."}
          </Text>
          <Text color={COLORS.DIM}>
            <Text color={COLORS.TEXT}>{plan.cookieSync.reason}</Text>
          </Text>
          <Text color={COLORS.DIM}>
            {cookieSyncNeedsAttention
              ? "Running without synced cookies will make this browser test less reliable and more likely to fail."
              : "This run will inherit your synced cookies, which should make authenticated checks more reliable."}
          </Text>
          {cookieSyncNeedsAttention ? (
            <Text color={COLORS.DIM}>
              Press <Text color={COLORS.PRIMARY}>c</Text> to turn cookie sync on
              before approving.
            </Text>
          ) : null}
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Collapsible
          label="Details"
          selected={isSectionSelected("details")}
          open={!collapsed["details"]}
          onToggle={() => toggleSection("details")}
        >
          <Text color={COLORS.DIM}>
            {"rationale  "}
            {plan.rationale}
          </Text>
          <Text color={COLORS.DIM}>
            {"target     "}
            {plan.targetSummary}
          </Text>
        </Collapsible>
      </Box>

      {cookieSyncIsRequired ? (
        <Box flexDirection="column" marginTop={1}>
          <Collapsible
            label="Cookie sync"
            selected={isSectionSelected("cookies")}
            open={!collapsed["cookies"]}
            onToggle={() => toggleSection("cookies")}
          >
            <Text color={COLORS.DIM}>
              {"required  "}
              <Text color={COLORS.YELLOW} bold>
                yes
              </Text>
            </Text>
            <Text color={COLORS.DIM}>
              {"reason    "}
              <Text color={COLORS.TEXT}>{plan.cookieSync.reason}</Text>
            </Text>
            <Clickable
              onClick={() =>
                updateEnvironment({
                  ...(environment ?? {}),
                  cookies: !cookiesEnabled,
                })
              }
            >
              <Text color={COLORS.DIM}>
                {"sync      "}
                <Text color={cookiesEnabled ? COLORS.GREEN : COLORS.RED} bold>
                  {cookiesEnabled ? "on" : "off"}
                </Text>
                <Text color={COLORS.DIM}> (c to toggle)</Text>
              </Text>
            </Clickable>
            <Text color={COLORS.DIM}>
              {"impact    "}
              <Text color={cookieSyncNeedsAttention ? COLORS.RED : COLORS.TEXT}>
                {cookieSyncNeedsAttention
                  ? "Without synced cookies, this run is more likely to fail."
                  : "Synced cookies will make the run more reliable."}
              </Text>
            </Text>
          </Collapsible>
        </Box>
      ) : null}

      {plan.assumptions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Collapsible
            label="Assumptions"
            count={plan.assumptions.length}
            selected={isSectionSelected("assumptions")}
            open={!collapsed["assumptions"]}
            onToggle={() => toggleSection("assumptions")}
          >
            {plan.assumptions.map((assumption, index) => (
              <Text key={`${assumption}-${index}`} color={COLORS.DIM}>
                <Text color={COLORS.TEXT}>{assumption}</Text>
              </Text>
            ))}
            {isSectionSelected("assumptions") && !editingAssumptions ? (
              <Text color={COLORS.DIM}>
                <Text color={COLORS.PRIMARY}>e</Text>
                {" to edit assumptions or add notes"}
              </Text>
            ) : null}
          </Collapsible>
        </Box>
      ) : null}

      {saveMessage ? (
        <Box marginTop={1}>
          <Text color={COLORS.GREEN}>{saveMessage}</Text>
        </Box>
      ) : null}

      <ErrorMessage message={saveError} />

      <Box flexDirection="column" marginTop={1}>
        <Collapsible
          label="Steps"
          count={plan.steps.length}
          selected={isSectionSelected("steps")}
          open={!collapsed["steps"]}
          onToggle={() => toggleSection("steps")}
        >
          <Box flexDirection="column">
            {plan.steps.map((step, index) => {
              const selected =
                currentItem?.kind === "step" && currentItem.stepIndex === index;
              return (
                <PlanStepRow
                  key={step.id}
                  step={step}
                  selected={selected}
                  onClick={() => {
                    const itemIndex = items.findIndex(
                      (item) => item.kind === "step" && item.stepIndex === index
                    );
                    if (itemIndex >= 0) setSelectedIndex(itemIndex);
                  }}
                />
              );
            })}
          </Box>
          {currentItem?.kind === "step" && plan.steps[currentItem.stepIndex] ? (
            <Box marginTop={1}>
              <StepPreview
                step={plan.steps[currentItem.stepIndex]}
                stepNumber={currentItem.stepIndex + 1}
                totalSteps={plan.steps.length}
              />
            </Box>
          ) : null}
        </Collapsible>
      </Box>

      {editingState ? (
        <Box flexDirection="column" marginTop={1}>
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
              onChange={(nextValue) =>
                setEditingValue(stripMouseSequences(nextValue))
              }
            />
          </Box>
        </Box>
      ) : null}

      {saving ? (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>Saving flow...</Text>
        </Box>
      ) : null}

      {exitConfirmationVisible ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={COLORS.YELLOW}
          paddingX={1}
        >
          <Text color={COLORS.YELLOW} bold>
            Leave plan review?
          </Text>
          <Text color={COLORS.DIM}>
            You have not started this run yet. Press{" "}
            <Text color={COLORS.PRIMARY}>y</Text> to leave or{" "}
            <Text color={COLORS.PRIMARY}>n</Text> to stay here.
          </Text>
        </Box>
      ) : null}
    </Box>
  );
};
