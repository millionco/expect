import { Box, Text } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import stringWidth from "string-width";
import { useColors, useThemeContext } from "../theme-context";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./hint-bar";
import { useNavigationStore, type Screen } from "../../stores/use-navigation";
import { useFlowSessionStore } from "../../stores/use-flow-session";
import { useGitState } from "../../hooks/use-git-state";
import { Clickable } from "./clickable";
import { TextShimmer } from "./text-shimmer";

const useHintSegments = (screen: Screen): HintSegment[] => {
  const COLORS = useColors();
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const goBack = useFlowSessionStore((state) => state.goBack);
  const updateEnvironment = useFlowSessionStore((state) => state.updateEnvironment);
  const browserEnvironment = useFlowSessionStore((state) => state.browserEnvironment);
  const startTesting = useFlowSessionStore((state) => state.startTesting);
  const latestRunReport = useFlowSessionStore((state) => state.latestRunReport);
  const liveViewUrl = useFlowSessionStore((state) => state.liveViewUrl);
  switch (screen) {
    case "main":
      return [
        { key: "ctrl+p", label: "pick pr", onClick: () => navigateTo("select-pr") },
        { key: "ctrl+r", label: "saved flows", onClick: () => navigateTo("saved-flow-picker") },
        { key: "ctrl+t", label: "theme", onClick: () => navigateTo("theme") },
      ];
    case "select-pr":
      return [
        { key: "↑↓", label: "nav" },
        { key: "←→", label: "filter" },
        { key: "/", label: "search" },
        { key: "esc", label: "back", cta: true, onClick: goBack },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "saved-flow-picker":
      return [
        { key: "↑↓", label: "nav" },
        { key: "esc", label: "back", onClick: goBack },
        { key: "d", label: "remove" },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "cookie-sync-confirm":
      return [
        { key: "↑↓", label: "nav" },
        { key: "esc", label: "back", onClick: goBack },
        {
          key: "c",
          label: "enable sync",
          cta: true,
          onClick: () => {
            updateEnvironment({
              ...(browserEnvironment ?? {}),
              cookies: true,
            });
            startTesting();
          },
        },
        {
          key: "a",
          label: "run anyway",
          color: COLORS.PRIMARY,
          cta: true,
          onClick: startTesting,
        },
      ];
    case "testing": {
      const hints: HintSegment[] = [{ key: "esc", label: "cancel" }];
      if (liveViewUrl) {
        hints.push({ key: "o", label: "open live view", cta: true });
      }
      return hints;
    }
    case "results": {
      const resultsHints: HintSegment[] = [];
      if (latestRunReport?.artifacts.shareUrl) {
        resultsHints.push({ key: "o", label: "open report" });
      }
      return [
        ...resultsHints,
        { key: "s", label: "save flow" },
        { key: "y", label: "copy", color: COLORS.PRIMARY, cta: true },
        ...(latestRunReport?.pullRequest ? [{ key: "p", label: "post to PR", cta: true }] : []),
        { key: "esc", label: "main menu", cta: true, onClick: goBack },
      ];
    }
    case "theme":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "light/dark" },
        { key: "esc", label: "cancel", cta: true, onClick: goBack },
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
      {screen === "testing" ? (
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
