import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Input } from "./ui/input.js";
import { useColors } from "./theme-context.js";
import { stripMouseSequences } from "../hooks/mouse-context.js";
import { Clickable } from "./ui/clickable.js";
import { Collapsible } from "./ui/collapsible.js";
import { saveFlow } from "../utils/save-flow.js";
import { useAppStore } from "../store.js";
import { truncateText } from "../utils/truncate-text.js";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";
import { ScreenHeading } from "./ui/screen-heading.js";
import { ErrorMessage } from "./ui/error-message.js";
import type { BrowserFlowPlan } from "@browser-tester/supervisor";
import {
  COMMIT_SELECTOR_WIDTH,
  SECTION_INDENT,
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

interface PlanStepRowProps {
  step: BrowserFlowPlan["steps"][number];
  selected: boolean;
  titleColumnWidth: number;
  onClick: () => void;
}

const PlanStepRow = ({ step, selected, titleColumnWidth, onClick }: PlanStepRowProps) => {
  const COLORS = useColors();
  return (
    <Clickable onClick={onClick}>
      <Box flexDirection="column" marginTop={0}>
        <Text>
          <Text color={selected ? COLORS.ORANGE : COLORS.DIM}>{selected ? "  ❯ " : "    "}</Text>
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
            <Text color={COLORS.DIM}>
              {"".padEnd(SECTION_INDENT + STEP_ID_COLUMN_WIDTH)}
              {"instruction  "}
              <Text color={COLORS.TEXT}>{step.instruction}</Text>
            </Text>
            <Text color={COLORS.DIM}>
              {"".padEnd(SECTION_INDENT + STEP_ID_COLUMN_WIDTH)}
              {"expected     "}
              <Text color={COLORS.TEXT}>{step.expectedOutcome}</Text>
            </Text>
          </>
        ) : null}
      </Box>
    </Clickable>
  );
};

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
    SECTION_INDENT;

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

  const toggleSection = (section: Section) => {
    setCollapsed((previous) => ({
      ...previous,
      [section]: !previous[section],
    }));
  };

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
      toggleSection(currentItem.section);
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

  const isSectionSelected = (section: Section) =>
    currentItem?.kind === "section" && currentItem.section === section;

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <ScreenHeading title="Review browser plan" subtitle={plan.title} />

      <Box flexDirection="column" marginTop={1}>
        <Collapsible
          label="Details"
          selected={isSectionSelected("details")}
          open={!collapsed["details"]}
          onToggle={() => toggleSection("details")}
        >
          <Box flexDirection="column" marginLeft={SECTION_INDENT}>
            <Text color={COLORS.DIM}>
              {"rationale  "}
              <Text color={COLORS.TEXT}>{plan.rationale}</Text>
            </Text>
            <Text color={COLORS.DIM}>
              {"target     "}
              <Text color={COLORS.TEXT}>{plan.targetSummary}</Text>
            </Text>
          </Box>
        </Collapsible>
      </Box>

      {plan.assumptions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Collapsible
            label="Assumptions"
            count={plan.assumptions.length}
            selected={isSectionSelected("assumptions")}
            open={!collapsed["assumptions"]}
            onToggle={() => toggleSection("assumptions")}
          >
            {plan.assumptions.map((assumption) => (
              <Text key={assumption} color={COLORS.DIM}>
                {"    "}
                <Text color={COLORS.TEXT}>{assumption}</Text>
              </Text>
            ))}
          </Collapsible>
        </Box>
      ) : null}

      {plan.cookieSync.required ? (
        <Box flexDirection="column" marginTop={1}>
          <Collapsible
            label="Cookie sync"
            selected={isSectionSelected("cookies")}
            open={!collapsed["cookies"]}
            onToggle={() => toggleSection("cookies")}
          >
            <Box flexDirection="column" marginLeft={SECTION_INDENT}>
              <Text color={COLORS.DIM}>
                {"reason  "}
                <Text color={COLORS.TEXT}>{plan.cookieSync.reason}</Text>
              </Text>
              <Clickable
                onClick={() =>
                  updateEnvironment({ ...(environment ?? {}), cookies: !cookiesEnabled })
                }
              >
                <Text color={COLORS.DIM}>
                  {"sync    "}
                  <Text color={cookiesEnabled ? COLORS.GREEN : COLORS.TEXT} bold={cookiesEnabled}>
                    {cookiesEnabled ? "on" : "off"}
                  </Text>
                  <Text color={COLORS.DIM}> (c to toggle)</Text>
                </Text>
              </Clickable>
            </Box>
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
          <Text color={COLORS.DIM}>
            {"    "}
            {"ID".padEnd(STEP_ID_COLUMN_WIDTH)}
            {"Instruction".padEnd(titleColumnWidth)}
            {"Route"}
          </Text>
          {plan.steps.map((step, index) => {
            const selected = currentItem?.kind === "step" && currentItem.stepIndex === index;
            return (
              <PlanStepRow
                key={step.id}
                step={step}
                selected={selected}
                titleColumnWidth={titleColumnWidth}
                onClick={() => {
                  const itemIndex = items.findIndex(
                    (item) => item.kind === "step" && item.stepIndex === index,
                  );
                  if (itemIndex >= 0) setSelectedIndex(itemIndex);
                }}
              />
            );
          })}
        </Collapsible>
      </Box>

      {editingStep ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.YELLOW}>
            Editing {editingStep.id}
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

      {saving ? (
        <Box marginTop={1}>
          <Text color={COLORS.DIM}>Saving flow...</Text>
        </Box>
      ) : null}
    </Box>
  );
};
