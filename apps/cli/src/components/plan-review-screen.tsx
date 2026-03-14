import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useColors } from "./theme-context.js";
import { saveFlow } from "../utils/save-flow.js";
import { useAppStore } from "../store.js";
import { truncateText } from "../utils/truncate-text.js";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";
import {
  COMMIT_SELECTOR_WIDTH,
  STEP_ID_COLUMN_WIDTH,
  STEP_ROUTE_COLUMN_WIDTH,
} from "../constants.js";

export const PlanReviewScreen = () => {
  const [columns] = useStdoutDimensions();
  const COLORS = useColors();
  const plan = useAppStore((state) => state.generatedPlan);
  const environment = useAppStore((state) => state.browserEnvironment);
  const resolvedTarget = useAppStore((state) => state.resolvedTarget);
  const updatePlan = useAppStore((state) => state.updatePlan);
  const updateEnvironment = useAppStore((state) => state.updateEnvironment);
  const approvePlan = useAppStore((state) => state.approvePlan);
  const loadSavedFlows = useAppStore((state) => state.loadSavedFlows);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!plan || !resolvedTarget) return null;

  const selectedStep = useMemo(
    () => plan.steps[selectedIndex] ?? null,
    [plan.steps, selectedIndex],
  );
  const editingStep = editingIndex === null ? null : (plan.steps[editingIndex] ?? null);
  const cookiesEnabled = (environment ?? {}).cookies === true;

  const titleColumnWidth =
    columns -
    COMMIT_SELECTOR_WIDTH -
    STEP_ID_COLUMN_WIDTH -
    STEP_ROUTE_COLUMN_WIDTH -
    4;

  useInput((input, key) => {
    if (editingStep) {
      if (key.escape) {
        setEditingIndex(null);
        setEditingValue("");
      }
      if (key.return && editingValue.trim()) {
        updatePlan({
          ...plan,
          steps: plan.steps.map((step, index) =>
            index === editingIndex ? { ...step, instruction: editingValue.trim() } : step,
          ),
        });
        setEditingIndex(null);
        setEditingValue("");
      }
      return;
    }

    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(plan.steps.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }
    if (input === "e" && selectedStep) {
      setEditingIndex(selectedIndex);
      setEditingValue(selectedStep.instruction);
    }
    if (input === "c" && plan.cookieSync.required) {
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
          setSaveMessage(`Saved ${result.flowPath} and updated ${result.directoryPath}`);
          void loadSavedFlows();
        })
        .catch((caughtError) => {
          setSaveError(caughtError instanceof Error ? caughtError.message : "Failed to save flow.");
        })
        .finally(() => {
          setSaving(false);
        });
    }
    if (input === "a") {
      approvePlan(plan);
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Text bold color={COLORS.TEXT}>
        Review browser plan
      </Text>
      <Text color={COLORS.DIM}>{plan.title}</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text color={COLORS.DIM}>
          <Text color={COLORS.TEXT} bold>rationale</Text>  {plan.rationale}
        </Text>
        <Text color={COLORS.DIM}>
          <Text color={COLORS.TEXT} bold>target</Text>     {plan.targetSummary}
        </Text>
      </Box>

      {plan.assumptions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.YELLOW}>
            Assumptions ({plan.assumptions.length})
          </Text>
          {plan.assumptions.map((assumption) => (
            <Text key={assumption} color={COLORS.DIM}>
              {"  "}- {assumption}
            </Text>
          ))}
        </Box>
      ) : null}

      {plan.cookieSync.required ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={cookiesEnabled ? COLORS.GREEN : COLORS.YELLOW}>
            Cookie sync
          </Text>
          <Text color={COLORS.DIM}>  {plan.cookieSync.reason}</Text>
          <Text>
            {"  "}
            <Text color={cookiesEnabled ? COLORS.GREEN : COLORS.DIM} bold={cookiesEnabled}>
              sync local cookies: {cookiesEnabled ? "on" : "off"}
            </Text>
            <Text color={COLORS.DIM}> (c to toggle)</Text>
          </Text>
        </Box>
      ) : null}

      {saveMessage ? (
        <Box marginTop={1}>
          <Text color={COLORS.GREEN}>{saveMessage}</Text>
        </Box>
      ) : null}

      {saveError ? (
        <Box marginTop={1}>
          <Text color={COLORS.RED}>{saveError}</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={COLORS.TEXT}>
          Steps ({plan.steps.length})
        </Text>
        <Text color={COLORS.DIM}>
          {"  "}
          {"ID".padEnd(STEP_ID_COLUMN_WIDTH)}
          {"Instruction".padEnd(titleColumnWidth)}
          {"Route"}
        </Text>
        {plan.steps.map((step, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={step.id} flexDirection="column" marginTop={0}>
              <Text>
                <Text color={isSelected ? COLORS.ORANGE : COLORS.DIM}>
                  {isSelected ? "❯ " : "  "}
                </Text>
                <Text color={COLORS.PURPLE} bold={isSelected}>
                  {step.id.padEnd(STEP_ID_COLUMN_WIDTH)}
                </Text>
                <Text color={isSelected ? COLORS.TEXT : COLORS.DIM} bold={isSelected}>
                  {truncateText(step.title, titleColumnWidth - 1).padEnd(titleColumnWidth)}
                </Text>
                <Text color={COLORS.CYAN}>
                  {truncateText(step.routeHint || "—", STEP_ROUTE_COLUMN_WIDTH)}
                </Text>
              </Text>
              {isSelected ? (
                <>
                  <Text>
                    {"".padEnd(COMMIT_SELECTOR_WIDTH + STEP_ID_COLUMN_WIDTH)}
                    <Text color={COLORS.TEXT}>instruction</Text>
                    <Text color={COLORS.DIM}>  {step.instruction}</Text>
                  </Text>
                  <Text>
                    {"".padEnd(COMMIT_SELECTOR_WIDTH + STEP_ID_COLUMN_WIDTH)}
                    <Text color={COLORS.TEXT}>expected</Text>
                    <Text color={COLORS.DIM}>     {step.expectedOutcome}</Text>
                  </Text>
                </>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {editingStep ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.YELLOW}>Editing {editingStep.id}</Text>
          <Box marginTop={0}>
            <Text color={COLORS.DIM}>/</Text>
            <TextInput focus value={editingValue} onChange={setEditingValue} />
          </Box>
        </Box>
      ) : null}

      {saving ? (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>Saving flow...</Text>
        </Box>
      ) : null}
    </Box>
  );
};
