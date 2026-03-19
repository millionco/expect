import { Box, Text } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import stringWidth from "string-width";
import { useColors, useThemeContext } from "../theme-context.js";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./hint-bar.js";
import { useNavigationStore, Screen } from "../../stores/use-navigation.js";
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { usePlanStore, Plan } from "../../stores/use-plan-store.js";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store.js";
import { useGitState } from "../../hooks/use-git-state.js";
import { Clickable } from "./clickable.js";
import { TextShimmer } from "./text-shimmer.js";

const useHintSegments = (screen: Screen): HintSegment[] => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const setPlan = usePlanStore((state) => state.setPlan);
  const skipPlanning = usePreferencesStore((state) => state.skipPlanning);

  switch (screen._tag) {
    case "Main": {
      return [
        {
          key: "shift+tab",
          label: `skip planning ${skipPlanning ? "on" : "off"}`,
          color: skipPlanning ? COLORS.GREEN : undefined,
        },
      ];
    }
    case "SelectPr":
      return [
        { key: "↑↓", label: "nav" },
        { key: "←→", label: "filter" },
        { key: "/", label: "search" },
        { key: "esc", label: "back", cta: true, onClick: () => setScreen(Screen.Main()) },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "SavedFlowPicker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "esc", label: "back", cta: true, onClick: () => setScreen(Screen.Main()) },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "Planning": {
      return [{ key: "esc", label: "cancel", cta: true, onClick: () => setScreen(Screen.Main()) }];
    }
    case "ReviewPlan":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "fold" },
        { key: "esc", label: "leave" },
        { key: "e", label: "edit", cta: true },
        {
          key: "a/enter",
          label: "approve",
          color: COLORS.PRIMARY,
          cta: true,
          onClick: () => {
            if (screen.plan.requiresCookies) {
              setScreen(Screen.CookieSyncConfirm({ plan: screen.plan }));
            } else {
              setScreen(Screen.Testing({ plan: screen.plan }));
            }
          },
        },
      ];
    case "CookieSyncConfirm":
      return [
        { key: "↑↓", label: "nav" },
        {
          key: "esc",
          label: "back",
          onClick: () =>
            setScreen(skipPlanning ? Screen.Main() : Screen.ReviewPlan({ plan: screen.plan })),
        },
        {
          key: "c",
          label: "enable sync",
          cta: true,
          onClick: () => {
            const updated = screen.plan.update({ requiresCookies: true });
            setPlan(Plan.plan(updated));
            setScreen(Screen.Testing({ plan: updated }));
          },
        },
        {
          key: "a",
          label: "run anyway",
          color: COLORS.PRIMARY,
          cta: true,
          onClick: () => setScreen(Screen.Testing({ plan: screen.plan })),
        },
      ];
    case "Testing": {
      return [
        { key: "v", label: "cycle trace" },
        { key: "esc", label: "cancel" },
      ];
    }
    case "Results": {
      return [
        { key: "y", label: "copy", color: COLORS.PRIMARY, cta: true },
        {
          key: "esc",
          label: "main menu",
          cta: true,
          onClick: () => {
            usePlanStore.getState().setPlan(undefined);
            usePlanExecutionStore.getState().setExecutedPlan(undefined);
            setScreen(Screen.Main());
          },
        },
      ];
    }
    case "Theme":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "light/dark" },
        { key: "esc", label: "cancel", cta: true, onClick: () => setScreen(Screen.Main()) },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    default:
      return [];
  }
};

const getHintText = (segments: HintSegment[]): string =>
  segments.length > 0
    ? ` ${segments.map((segment) => `${segment.label} [${segment.key}]`).join(HINT_SEPARATOR)}`
    : "";

export const Modeline = () => {
  const [columns] = useStdoutDimensions();
  const { theme } = useThemeContext();
  const { data: gitState } = useGitState();
  const screen = useNavigationStore((state) => state.screen);
  const segments = useHintSegments(screen);

  if (!gitState) return null;

  const keybinds = segments.filter((segment) => !segment.cta);
  const actions = segments.filter((segment) => segment.cta);

  const keybindText = getHintText(keybinds);
  const actionPills = actions
    .map((action) =>
      action.color ? ` ${action.label} [${action.key}] ` : `${action.label} [${action.key}]`,
    )
    .join("   ");
  const actionWidth = actions.length > 0 ? stringWidth(actionPills) : 0;
  const rightWidth = stringWidth(keybindText);
  const gap = Math.max(0, columns - actionWidth - rightWidth - 2);

  return (
    <Box flexDirection="column">
      {screen._tag === "Testing" ? (
        <TextShimmer
          text={"─".repeat(columns)}
          baseColor={theme.border}
          highlightColor={theme.primary}
          speed={3}
        />
      ) : (
        <Text color={theme.border}>{"─".repeat(columns)}</Text>
      )}
      <Box paddingX={1}>
        {actions.map((action, index) => {
          const pill = (
            <Text key={action.key + action.label}>
              {index > 0 ? "   " : ""}
              {action.color ? (
                <Text backgroundColor={action.color} color="#000000">
                  {" "}
                  <Text bold>{action.label}</Text> <Text>[{action.key}]</Text>{" "}
                </Text>
              ) : (
                <Text>
                  <Text color={theme.textMuted}>{action.label} </Text>
                  <Text color={theme.textMuted}>[{action.key}]</Text>
                </Text>
              )}
            </Text>
          );

          return action.onClick ? (
            <Clickable key={action.key + action.label} onClick={action.onClick} fullWidth={false}>
              {pill}
            </Clickable>
          ) : (
            pill
          );
        })}
        <Text>{" ".repeat(gap)}</Text>
        {keybinds.length > 0 ? (
          <HintBar segments={keybinds} color={theme.primary} mutedColor={theme.textMuted} />
        ) : null}
      </Box>
    </Box>
  );
};
