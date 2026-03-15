import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Input } from "../ui/input.js";
import { useColors } from "../theme-context.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import { Clickable } from "../ui/clickable.js";
import { Collapsible } from "../ui/collapsible.js";
import { saveFlow } from "../../utils/save-flow.js";
import { useAppStore } from "../../store.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import { ErrorMessage } from "../ui/error-message.js";
import type { BrowserFlowPlan } from "@browser-tester/supervisor";
import { SECTION_INDENT } from "../../constants.js";

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
  stepNumber: number;
  selected: boolean;
  onClick: () => void;
}

const PlanStepRow = ({
  step,
  stepNumber,
  selected,
  onClick,
}: PlanStepRowProps) => {
  const COLORS = useColors();
  const stepLabel = String(stepNumber).padStart(2, "0");

  return (
    <Clickable onClick={onClick}>
      <Box flexDirection="column">
        <Text>
          <Text color={selected ? COLORS.PRIMARY : COLORS.DIM}>
            {selected ? "  ▸ " : "    "}
          </Text>
          <Text color={COLORS.DIM}>[{stepLabel}] </Text>
          <Text color={selected ? COLORS.PRIMARY : COLORS.DIM} bold={selected}>
            {step.title}
          </Text>
        </Text>
        {selected ? (
          <Box
            flexDirection="column"
            marginLeft={SECTION_INDENT}
            marginBottom={1}
          >
            <Text color={COLORS.DIM}>
              {"  "}
              <Text color={COLORS.TEXT}>{step.instruction}</Text>
            </Text>
            <Text color={COLORS.DIM}>
              {"  expected "}
              <Text color={COLORS.GREEN}>{step.expectedOutcome}</Text>
            </Text>
            {step.routeHint ? (
              <Text color={COLORS.DIM}>
                {"  route    "}
                <Text color={COLORS.CYAN}>{step.routeHint}</Text>
              </Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Clickable>
  );
};

export const PlanReviewScreen = () => {
  const COLORS = useColors();
  const plan = useAppStore((state) => state.generatedPlan);
  const environment = useAppStore((state) => state.browserEnvironment);
  const resolvedTarget = useAppStore((state) => state.resolvedTarget);
  const updatePlan = useAppStore((state) => state.updatePlan);
  const updateEnvironment = useAppStore((state) => state.updateEnvironment);
  const approvePlan = useAppStore((state) => state.approvePlan);
  const loadSavedFlows = useAppStore((state) => state.loadSavedFlows);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    assumptions: true,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!plan || !resolvedTarget) return null;

  const editingStep =
    editingIndex === null ? null : plan.steps[editingIndex] ?? null;
  const cookiesEnabled = (environment ?? {}).cookies === true;

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
            index === editingIndex
              ? { ...step, instruction: editingValue.trim() }
              : step
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
              {plan.rationale}
            </Text>
            <Text color={COLORS.DIM}>
              {"target     "}
              {plan.targetSummary}
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
                  updateEnvironment({
                    ...(environment ?? {}),
                    cookies: !cookiesEnabled,
                  })
                }
              >
                <Text color={COLORS.DIM}>
                  {"sync    "}
                  <Text
                    color={cookiesEnabled ? COLORS.GREEN : COLORS.TEXT}
                    bold={cookiesEnabled}
                  >
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
          {plan.steps.map((step, index) => {
            const selected =
              currentItem?.kind === "step" && currentItem.stepIndex === index;
            return (
              <PlanStepRow
                key={step.id}
                step={step}
                stepNumber={index + 1}
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
    </Box>
  );
};
