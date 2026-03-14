import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!plan || !resolvedTarget) return null;

  const editingStep = editingIndex === null ? null : (plan.steps[editingIndex] ?? null);
  const cookiesEnabled = (environment ?? {}).cookies === true;

  const titleColumnWidth =
    columns -
    COMMIT_SELECTOR_WIDTH -
    STEP_ID_COLUMN_WIDTH -
    STEP_ROUTE_COLUMN_WIDTH -
    4;

  const items: NavigableItem[] = useMemo(() => {
    const result: NavigableItem[] = [];
    result.push({ kind: "section", section: "details" });
    if (plan.assumptions.length > 0) {
      result.push({ kind: "section", section: "assumptions" });
    }
    if (plan.cookieSync.required) {
      result.push({ kind: "section", section: "cookies" });
    }
    result.push({ kind: "section", section: "steps" });
    if (!collapsed["steps"]) {
      plan.steps.forEach((_, index) => {
        result.push({ kind: "step", stepIndex: index });
      });
    }
    return result;
  }, [plan, collapsed]);

  const currentItem = items[selectedIndex];

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
      setSelectedIndex((previous) => Math.min(items.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (key.tab && currentItem?.kind === "section") {
      setCollapsed((previous) => ({
        ...previous,
        [currentItem.section]: !previous[currentItem.section],
      }));
    }

    if (input === "e" && currentItem?.kind === "step") {
      const step = plan.steps[currentItem.stepIndex];
      if (step) {
        setEditingIndex(currentItem.stepIndex);
        setEditingValue(step.instruction);
      }
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

  const isItemSelected = (item: NavigableItem) => {
    if (!currentItem) return false;
    if (item.kind === "section" && currentItem.kind === "section") {
      return item.section === currentItem.section;
    }
    if (item.kind === "step" && currentItem.kind === "step") {
      return item.stepIndex === currentItem.stepIndex;
    }
    return false;
  };

  const sectionLabel = (section: Section, label: string, count?: number) => {
    const isSelected = currentItem?.kind === "section" && currentItem.section === section;
    const isCollapsed = Boolean(collapsed[section]);
    const arrow = isCollapsed ? figures.triangleRight : figures.triangleDown;
    const countSuffix = count !== undefined ? ` (${count})` : "";
    return (
      <Text>
        <Text color={isSelected ? COLORS.ORANGE : COLORS.DIM}>
          {isSelected ? "❯ " : "  "}
        </Text>
        <Text color={isSelected ? COLORS.TEXT : COLORS.DIM}>{arrow} </Text>
        <Text bold color={isSelected ? COLORS.TEXT : COLORS.DIM}>
          {label}{countSuffix}
        </Text>
      </Text>
    );
  };

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Text bold color={COLORS.TEXT}>
        Review browser plan
      </Text>
      <Text color={COLORS.DIM}>{plan.title}</Text>

      <Box flexDirection="column" marginTop={1}>
        {sectionLabel("details", "Details")}
        {!collapsed["details"] ? (
          <Box flexDirection="column" marginLeft={4}>
            <Text color={COLORS.DIM}>
              <Text color={COLORS.TEXT}>rationale</Text>  {plan.rationale}
            </Text>
            <Text color={COLORS.DIM}>
              <Text color={COLORS.TEXT}>target</Text>     {plan.targetSummary}
            </Text>
          </Box>
        ) : null}
      </Box>

      {plan.assumptions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {sectionLabel("assumptions", "Assumptions", plan.assumptions.length)}
          {!collapsed["assumptions"]
            ? plan.assumptions.map((assumption) => (
                <Text key={assumption} color={COLORS.DIM}>
                  {"    "}- {assumption}
                </Text>
              ))
            : null}
        </Box>
      ) : null}

      {plan.cookieSync.required ? (
        <Box flexDirection="column" marginTop={1}>
          {sectionLabel("cookies", "Cookie sync")}
          {!collapsed["cookies"] ? (
            <Box flexDirection="column" marginLeft={4}>
              <Text color={COLORS.DIM}>{plan.cookieSync.reason}</Text>
              <Text>
                <Text color={cookiesEnabled ? COLORS.GREEN : COLORS.DIM} bold={cookiesEnabled}>
                  sync local cookies: {cookiesEnabled ? "on" : "off"}
                </Text>
                <Text color={COLORS.DIM}> (c to toggle)</Text>
              </Text>
            </Box>
          ) : null}
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
        {sectionLabel("steps", "Steps", plan.steps.length)}
        {!collapsed["steps"] ? (
          <>
            <Text color={COLORS.DIM}>
              {"    "}
              {"ID".padEnd(STEP_ID_COLUMN_WIDTH)}
              {"Instruction".padEnd(titleColumnWidth)}
              {"Route"}
            </Text>
            {plan.steps.map((step, index) => {
              const selected = isItemSelected({ kind: "step", stepIndex: index });
              return (
                <Box key={step.id} flexDirection="column" marginTop={0}>
                  <Text>
                    <Text color={selected ? COLORS.ORANGE : COLORS.DIM}>
                      {selected ? "  ❯ " : "    "}
                    </Text>
                    <Text color={COLORS.PURPLE} bold={selected}>
                      {step.id.padEnd(STEP_ID_COLUMN_WIDTH)}
                    </Text>
                    <Text color={selected ? COLORS.TEXT : COLORS.DIM} bold={selected}>
                      {truncateText(step.title, titleColumnWidth - 1).padEnd(titleColumnWidth)}
                    </Text>
                    <Text color={COLORS.CYAN}>
                      {truncateText(step.routeHint || "—", STEP_ROUTE_COLUMN_WIDTH)}
                    </Text>
                  </Text>
                  {selected ? (
                    <>
                      <Text>
                        {"".padEnd(COMMIT_SELECTOR_WIDTH + STEP_ID_COLUMN_WIDTH + 2)}
                        <Text color={COLORS.TEXT}>instruction</Text>
                        <Text color={COLORS.DIM}>  {step.instruction}</Text>
                      </Text>
                      <Text>
                        {"".padEnd(COMMIT_SELECTOR_WIDTH + STEP_ID_COLUMN_WIDTH + 2)}
                        <Text color={COLORS.TEXT}>expected</Text>
                        <Text color={COLORS.DIM}>     {step.expectedOutcome}</Text>
                      </Text>
                    </>
                  ) : null}
                </Box>
              );
            })}
          </>
        ) : null}
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
