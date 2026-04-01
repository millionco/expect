import { Box, Text } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import stringWidth from "string-width";
import { useColors, theme } from "../theme-context";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./hint-bar";
import { Option } from "effect";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import { usePlanExecutionStore } from "../../stores/use-plan-execution-store";
import { useGitState, type GitState } from "../../hooks/use-git-state";
import { useProjectPreferencesStore } from "../../stores/use-project-preferences";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useUpdateCheck } from "../../hooks/use-update-check";
import { TextShimmer } from "./text-shimmer";
import { AGENT_PROVIDER_DISPLAY_NAMES } from "@expect/shared/models";
import { useAtomValue } from "@effect/atom-react";
import { agentProviderAtom } from "../../data/runtime";

const useHintSegments = (screen: Screen, gitState: GitState | undefined): HintSegment[] => {
  const COLORS = useColors();
  const cookieBrowserKeys = useProjectPreferencesStore((state) => state.cookieBrowserKeys);
  const notifications = usePreferencesStore((state) => state.notifications);
  const expanded = usePlanExecutionStore((state) => state.expanded);
  const agentProviderValue = useAtomValue(agentProviderAtom);

  switch (screen._tag) {
    case "Main": {
      const agentLabel = Option.isSome(agentProviderValue)
        ? AGENT_PROVIDER_DISPLAY_NAMES[agentProviderValue.value]
        : "Agent";
      const segments: HintSegment[] = [
        { key: "ctrl+a", label: agentLabel, cta: true },
        {
          key: "ctrl+k",
          label:
            cookieBrowserKeys.length > 0 ? `cookies (${cookieBrowserKeys.length})` : "cookies off",
          cta: true,
        },
        { key: "ctrl+r", label: "saved flows", cta: true },
      ];
      if (gitState?.isGitRepo) {
        segments.push({ key: "ctrl+w", label: "watch", cta: true });
        segments.push({ key: "ctrl+p", label: "pick pr", cta: true });
      }
      return segments;
    }
    case "SelectPr":
      return [
        { key: "↑↓", label: "nav" },
        { key: "←→", label: "filter" },
        { key: "/", label: "search" },
        { key: "esc", label: "back", cta: true },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "SavedFlowPicker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "esc", label: "back", cta: true },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "AgentPicker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "esc", label: "back", cta: true },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "CookieSyncConfirm":
      return [
        { key: "↑↓", label: "nav" },
        { key: "space", label: "toggle" },
        { key: "a", label: "select all", cta: true },
        { key: "esc", label: "back", cta: true },
        { key: "enter", label: "confirm", color: COLORS.PRIMARY, cta: true },
      ];
    case "PortPicker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "space", label: "toggle" },
        { key: "/", label: "custom port" },
        { key: "esc", label: "back", cta: true },
        { key: "enter", label: "confirm", color: COLORS.PRIMARY, cta: true },
      ];
    case "Testing": {
      const notifyLabel = notifications === true ? "notify on" : "notify off";
      const expandLabel = expanded ? "collapse" : "expand";
      return [
        { key: "ctrl+n", label: notifyLabel, cta: true },
        { key: "ctrl+o", label: expandLabel, cta: true },
        { key: "esc", label: expanded ? "collapse" : "cancel" },
      ];
    }
    case "Watch": {
      const watchNotifyLabel = notifications === true ? "notify on" : "notify off";
      return [
        { key: "ctrl+n", label: watchNotifyLabel, cta: true },
        { key: "esc", label: "stop" },
      ];
    }
    case "Results": {
      const hints: HintSegment[] = [{ key: "y", label: "copy", cta: true }];
      if (Option.isSome(screen.report.pullRequest)) {
        hints.push({ key: "p", label: "post to PR", cta: true });
      }
      hints.push({ key: "s", label: "save flow", cta: true });
      hints.push({ key: "r", label: "restart", cta: true });
      hints.push({ key: "esc", label: "main menu", cta: true });
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
  let actions = allActions;
  while (actions.length > 0 && measureActions(actions) + rightWidth + 2 > columns) {
    actions = actions.slice(0, -1);
  }

  const actionWidth = measureActions(actions);
  const availableGap = columns - actionWidth - rightWidth - 2;
  const gap = Math.max(0, availableGap);

  return (
    <Box flexDirection="column">
      {(screen._tag === "Testing" || screen._tag === "Watch") && (
        <TextShimmer
          text={"─".repeat(columns)}
          baseColor={theme.shimmerBase}
          highlightColor={theme.shimmerHighlight}
          speed={3}
        />
      )}
      {screen._tag !== "Testing" && screen._tag !== "Watch" && (
        <Text color={theme.border}>{"─".repeat(columns)}</Text>
      )}
      <Box paddingX={1}>
        {actions.map((action, index) => (
          <Text key={action.key + action.label}>
            {index > 0 ? "   " : ""}
            {action.color && (
              <Text backgroundColor={action.color} color="black">
                {" "}
                <Text bold>{action.label}</Text> <Text>[{action.key}]</Text>{" "}
              </Text>
            )}
            {!action.color && (
              <Text>
                <Text color={theme.textMuted}>{action.label} </Text>
                <Text color={theme.textMuted}>[{action.key}]</Text>
              </Text>
            )}
          </Text>
        ))}
        <Text>{" ".repeat(gap)}</Text>
        {keybinds.length > 0 ? (
          <HintBar segments={keybinds} color={theme.primary} mutedColor={theme.textMuted} />
        ) : null}
      </Box>
    </Box>
  );
};
