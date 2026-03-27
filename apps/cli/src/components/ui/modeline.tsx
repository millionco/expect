import { Box, Text } from "ink";
import { ChangesFor } from "@expect/supervisor";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import stringWidth from "string-width";
import { useColors, theme } from "../theme-context";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./hint-bar";
import { Option } from "effect";
import {
  useNavigationStore,
  Screen,
  screenForWatchOrPortPicker,
  screenForTestingOrPortPicker,
} from "../../stores/use-navigation";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store";
import { useGitState, type GitState } from "../../hooks/use-git-state";
import { useProjectPreferencesStore } from "../../stores/use-project-preferences";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useUpdateCheck } from "../../hooks/use-update-check";
import { Clickable } from "./clickable";
import { TextShimmer } from "./text-shimmer";
import { DEFAULT_INSTRUCTION } from "../../utils/resolve-changes-for";

const useHintSegments = (screen: Screen, gitState: GitState | undefined): HintSegment[] => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const cookiesEnabled = useProjectPreferencesStore((state) => state.cookiesEnabled);
  const toggleCookies = useProjectPreferencesStore((state) => state.toggleCookies);
  const notifications = usePreferencesStore((state) => state.notifications);
  const toggleNotifications = usePreferencesStore((state) => state.toggleNotifications);
  const expanded = usePlanExecutionStore((state) => state.expanded);

  switch (screen._tag) {
    case "Main": {
      const segments: HintSegment[] = [
        {
          key: "ctrl+k",
          label: cookiesEnabled ? "cookies on" : "cookies off",
          cta: true,
          onClick: toggleCookies,
        },
        {
          key: "ctrl+r",
          label: "saved flows",
          cta: true,
          onClick: () => setScreen(Screen.SavedFlowPicker()),
        },
      ];
      if (gitState?.isGitRepo) {
        segments.push({
          key: "ctrl+p",
          label: "pick pr",
          cta: true,
          onClick: () => setScreen(Screen.SelectPr()),
        });
        segments.push({
          key: "ctrl+g",
          label: "watch changes",
          cta: true,
          onClick: () =>
            setScreen(
              screenForWatchOrPortPicker({
                changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
                instruction: DEFAULT_INSTRUCTION,
                requiresCookies: cookiesEnabled,
              }),
            ),
        });
      }
      return segments;
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
    case "CookieSyncConfirm":
      return [
        { key: "↑↓", label: "nav" },
        {
          key: "esc",
          label: "back",
          onClick: () => setScreen(Screen.Main()),
        },
        {
          key: "c",
          label: "enable sync",
          cta: true,
          onClick: () => {
            setScreen(
              (screen.mode === "watch" ? screenForWatchOrPortPicker : screenForTestingOrPortPicker)(
                {
                  changesFor: screen.changesFor,
                  instruction: screen.instruction,
                  savedFlow: screen.savedFlow,
                  requiresCookies: true,
                },
              ),
            );
          },
        },
        {
          key: "a",
          label: "run anyway",
          color: COLORS.PRIMARY,
          cta: true,
          onClick: () => {
            setScreen(
              (screen.mode === "watch" ? screenForWatchOrPortPicker : screenForTestingOrPortPicker)(
                {
                  changesFor: screen.changesFor,
                  instruction: screen.instruction,
                  savedFlow: screen.savedFlow,
                  requiresCookies: false,
                },
              ),
            );
          },
        },
      ];
    case "PortPicker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "space", label: "toggle" },
        { key: "/", label: "custom port" },
        { key: "esc", label: "back", cta: true, onClick: () => setScreen(Screen.Main()) },
        { key: "enter", label: "confirm", color: COLORS.PRIMARY, cta: true },
      ];
    case "Testing": {
      const notifyLabel = notifications === true ? "notify on" : "notify off";
      const expandLabel = expanded ? "collapse" : "expand";
      return [
        {
          key: "ctrl+n",
          label: notifyLabel,
          cta: true,
          onClick: toggleNotifications,
        },
        { key: "ctrl+o", label: expandLabel, cta: true },
        { key: "esc", label: expanded ? "collapse" : "cancel" },
      ];
    }
    case "Watch": {
      const notifyLabel = notifications === true ? "notify on" : "notify off";
      const hints: HintSegment[] = [
        {
          key: "ctrl+n",
          label: notifyLabel,
          cta: true,
          onClick: toggleNotifications,
        },
        { key: "esc", label: "stop watch", cta: true, onClick: () => setScreen(Screen.Main()) },
      ];
      return hints;
    }
    case "Results": {
      const hints: HintSegment[] = [{ key: "y", label: "copy", cta: true }];
      if (Option.isSome(screen.report.pullRequest)) {
        hints.push({ key: "p", label: "post to PR", cta: true });
      }
      hints.push({ key: "s", label: "save flow", cta: true });
      hints.push({
        key: "r",
        label: "restart",
        cta: true,
        onClick: () => {
          usePlanExecutionStore.getState().setExecutedPlan(undefined);
          setScreen(
            screenForTestingOrPortPicker({
              changesFor: screen.report.changesFor,
              instruction: screen.report.instruction,
            }),
          );
        },
      });
      hints.push({
        key: "esc",
        label: "main menu",
        cta: true,
        onClick: () => {
          usePlanExecutionStore.getState().setExecutedPlan(undefined);
          setScreen(Screen.Main());
        },
      });
      return hints;
    }
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
  const { data: gitState } = useGitState();
  const screen = useNavigationStore((state) => state.screen);
  const { latestVersion, updateAvailable } = useUpdateCheck();
  const baseSegments = useHintSegments(screen, gitState);

  const allSegments = updateAvailable
    ? [
        ...baseSegments,
        {
          key: "ctrl+u",
          label: `v${latestVersion} available`,
          cta: true,
          color: theme.warning,
        },
      ]
    : baseSegments;

  const keybinds = allSegments.filter((segment) => !segment.cta);
  const rightWidth = stringWidth(getHintText(keybinds));

  const measureActions = (actions: HintSegment[]) => {
    const text = actions
      .map((action) =>
        action.color ? ` ${action.label} [${action.key}] ` : `${action.label} [${action.key}]`,
      )
      .join("   ");
    return stringWidth(text);
  };

  const allActions = allSegments.filter((segment) => segment.cta);
  const totalWidth = measureActions(allActions) + rightWidth + 2;
  const actions =
    totalWidth > columns ? allActions.filter((segment) => segment.key !== "ctrl+p") : allActions;

  const actionWidth = measureActions(actions);
  const gap = Math.max(0, columns - actionWidth - rightWidth - 2);

  return (
    <Box flexDirection="column">
      {screen._tag === "Testing" ? (
        <TextShimmer
          text={"─".repeat(columns)}
          baseColor={theme.shimmerBase}
          highlightColor={theme.shimmerHighlight}
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
                <Text backgroundColor={action.color} color="black">
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
