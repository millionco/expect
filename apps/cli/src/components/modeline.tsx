import { Box, Text } from "ink";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";
import stringWidth from "string-width";
import { useColors, useThemeContext } from "./theme-context.js";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./ui/hint-bar.js";
import { useAppStore, type Screen } from "../store.js";

const useHintSegments = (screen: Screen): HintSegment[] => {
  const COLORS = useColors();
  const navigateTo = useAppStore((state) => state.navigateTo);
  const goBack = useAppStore((state) => state.goBack);
  const approvePlan = useAppStore((state) => state.approvePlan);
  const generatedPlan = useAppStore((state) => state.generatedPlan);
  const savedFlowSummaries = useAppStore((state) => state.savedFlowSummaries);

  switch (screen) {
    case "main": {
      const hints: HintSegment[] = [
        { key: "t", label: "theme", onClick: () => navigateTo("theme") },
        {
          key: "b",
          label: "branch",
          onClick: () => navigateTo("switch-branch"),
        },
      ];
      if (savedFlowSummaries.length > 0) {
        hints.push({
          key: "r",
          label: "reuse flow",
          onClick: () => navigateTo("saved-flow-picker"),
        });
      }
      hints.push({ key: "↑↓", label: "nav" });
      return hints;
    }
    case "switch-branch":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "local/remote" },
        { key: "/", label: "search" },
        { key: "esc", label: "back", cta: true, onClick: goBack },
        { key: "enter", label: "select", color: COLORS.GREEN, cta: true },
      ];
    case "select-commit":
      return [
        { key: "↑↓", label: "nav" },
        { key: "/", label: "search" },
        { key: "esc", label: "back", cta: true, onClick: goBack },
        { key: "enter", label: "select", color: COLORS.GREEN, cta: true },
      ];
    case "saved-flow-picker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "esc", label: "back", cta: true, onClick: goBack },
        { key: "enter", label: "select", color: COLORS.GREEN, cta: true },
      ];
    case "flow-input":
      return [
        { key: "esc", label: "back", cta: true, onClick: goBack },
        { key: "enter", label: "submit", color: COLORS.GREEN, cta: true },
      ];
    case "planning":
      return [{ key: "esc", label: "cancel", cta: true, onClick: goBack }];
    case "review-plan":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "fold" },
        {
          key: "esc",
          label: "cancel",
          color: COLORS.RED,
          cta: true,
          onClick: goBack,
        },
        { key: "e", label: "edit", cta: true },
        { key: "s", label: "save", color: COLORS.GREEN, cta: true },
        {
          key: "a",
          label: "approve",
          color: COLORS.GREEN,
          cta: true,
          onClick: () => {
            if (generatedPlan) approvePlan(generatedPlan);
          },
        },
      ];
    case "testing":
      return [];
    case "theme":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "light/dark" },
        { key: "esc", label: "cancel", cta: true, onClick: goBack },
        { key: "enter", label: "select", color: COLORS.GREEN, cta: true },
      ];
    default:
      return [];
  }
};

const getHintText = (segments: HintSegment[]): string =>
  segments.length > 0
    ? ` ${segments
        .map((segment) => `${segment.key} ${segment.label}`)
        .join(HINT_SEPARATOR)}`
    : "";

export const Modeline = () => {
  const [columns] = useStdoutDimensions();
  const { theme } = useThemeContext();
  const gitState = useAppStore((state) => state.gitState);
  const screen = useAppStore((state) => state.screen);
  const segments = useHintSegments(screen);

  if (!gitState) return null;

  const keybinds = segments.filter((segment) => !segment.cta);
  const actions = segments.filter((segment) => segment.cta);

  const branchLabel = ` ${gitState.currentBranch} `;
  const keybindText = getHintText(keybinds);
  const actionPills = actions
    .map((action) => ` ${action.key} ${action.label} `)
    .join(" ");
  const actionWidth = actions.length > 0 ? stringWidth(actionPills) : 0;
  const leftWidth = stringWidth(branchLabel) + stringWidth(keybindText);
  const ctaCenter = Math.floor(columns / 2);
  const ctaStart = ctaCenter - Math.floor(actionWidth / 2);
  const leftGap = Math.max(0, ctaStart - leftWidth - 1);
  const rightGap = Math.max(0, columns - leftWidth - leftGap - actionWidth - 2);

  return (
    <Box flexDirection="column">
      <Text color={theme.border}>{"─".repeat(columns)}</Text>
      <Box paddingX={1}>
        <Text color={theme.textMuted}>{branchLabel}</Text>
        {keybinds.length > 0 ? (
          <HintBar
            segments={keybinds}
            color={theme.primary}
            mutedColor={theme.textMuted}
          />
        ) : null}
        <Text>{" ".repeat(leftGap)}</Text>
        {actions.map((action, index) => (
          <Text key={action.key + action.label}>
            {index > 0 ? " " : ""}
            <Text
              backgroundColor={action.color ?? theme.border}
              color="#000000"
              bold
            >
              {" "}
              {action.key} {action.label}{" "}
            </Text>
          </Text>
        ))}
        <Text>{" ".repeat(rightGap)}</Text>
      </Box>
    </Box>
  );
};
