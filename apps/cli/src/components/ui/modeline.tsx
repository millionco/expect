import { Box, Text } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import stringWidth from "string-width";
import { useColors, useThemeContext } from "../theme-context.js";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./hint-bar.js";
import { useAppStore, type Screen } from "../../store.js";
import { Clickable } from "./clickable.js";
import { TextShimmer } from "./text-shimmer.js";

const useHintSegments = (screen: Screen): HintSegment[] => {
  const COLORS = useColors();
  const navigateTo = useAppStore((state) => state.navigateTo);
  const goBack = useAppStore((state) => state.goBack);
  const updateEnvironment = useAppStore((state) => state.updateEnvironment);
  const browserEnvironment = useAppStore((state) => state.browserEnvironment);
  const requestPlanApproval = useAppStore((state) => state.requestPlanApproval);
  const approvePlan = useAppStore((state) => state.approvePlan);
  const generatedPlan = useAppStore((state) => state.generatedPlan);
  const autoRunAfterPlanning = useAppStore((state) => state.autoRunAfterPlanning);
  const savedFlowSummaries = useAppStore((state) => state.savedFlowSummaries);
  const latestRunReport = useAppStore((state) => state.latestRunReport);
  const liveViewUrl = useAppStore((state) => state.liveViewUrl);
  switch (screen) {
    case "main": {
      const hints: HintSegment[] = [
        {
          key: "shift+tab",
          label: `auto-run after planning ${autoRunAfterPlanning ? "on" : "off"}`,
          color: autoRunAfterPlanning ? COLORS.GREEN : undefined,
        },
      ];
      if (savedFlowSummaries.length > 0) {
        hints.push({
          key: "r",
          label: "reuse flow",
          onClick: () => navigateTo("saved-flow-picker"),
        });
      }
      hints.push({
        key: "enter",
        label: "submit",
        color: COLORS.PRIMARY,
        cta: true,
      });
      return hints;
    }
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
        { key: "esc", label: "back", cta: true, onClick: goBack },
        { key: "enter", label: "select", color: COLORS.PRIMARY, cta: true },
      ];
    case "planning":
      return [{ key: "esc", label: "cancel", cta: true, onClick: goBack }];
    case "review-plan":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "fold" },
        { key: "s", label: "save" },
        ...(generatedPlan?.cookieSync.required
          ? [
              {
                key: "c",
                label: browserEnvironment?.cookies === true ? "cookies on" : "sync cookies",
                onClick: () =>
                  updateEnvironment({
                    ...(browserEnvironment ?? {}),
                    cookies: !(browserEnvironment?.cookies === true),
                  }),
              },
            ]
          : []),
        { key: "esc", label: "leave" },
        { key: "e", label: "edit", cta: true },
        {
          key: "a/enter",
          label: "approve",
          color: COLORS.PRIMARY,
          cta: true,
          onClick: requestPlanApproval,
        },
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
            approvePlan();
          },
        },
        {
          key: "a",
          label: "run anyway",
          color: COLORS.PRIMARY,
          cta: true,
          onClick: approvePlan,
        },
      ];
    case "testing": {
      const hints: HintSegment[] = [
        { key: "v", label: "cycle trace" },
        { key: "esc", label: "cancel" },
      ];
      if (liveViewUrl) {
        hints.push({ key: "o", label: "open live view", cta: true });
      }
      return hints;
    }
    case "results": {
      return [
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
  const gitState = useAppStore((state) => state.gitState);
  const screen = useAppStore((state) => state.screen);
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
      {screen === "planning" || screen === "testing" ? (
        <TextShimmer
          text={"-".repeat(columns)}
          baseColor={theme.border}
          highlightColor={theme.primary}
          speed={3}
        />
      ) : (
        <Text color={theme.border}>{"-".repeat(columns)}</Text>
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
                  <Text color={theme.primary} bold>
                    [{action.key}]
                  </Text>
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
