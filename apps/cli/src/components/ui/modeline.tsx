import { Box, Text } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import stringWidth from "string-width";
import { useColors, useThemeContext } from "../theme-context";
import { HintBar, HINT_SEPARATOR, type HintSegment } from "./hint-bar";
import { useNavigationStore, type Screen } from "../../stores/use-navigation";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useFlowSessionStore } from "../../stores/use-flow-session";
import { useGitState } from "../../hooks/use-git-state";
import { useSavedFlows } from "../../hooks/use-saved-flows";
import { Clickable } from "./clickable";
import { TextShimmer } from "./text-shimmer";

const useHintSegments = (screen: Screen): HintSegment[] => {
  const COLORS = useColors();
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const goBack = useFlowSessionStore((state) => state.goBack);
  const updateEnvironment = useFlowSessionStore((state) => state.updateEnvironment);
  const browserEnvironment = useFlowSessionStore((state) => state.browserEnvironment);
  const requestPlanApproval = useFlowSessionStore((state) => state.requestPlanApproval);
  const approvePlan = useFlowSessionStore((state) => state.approvePlan);
  const generatedPlan = useFlowSessionStore((state) => state.generatedPlan);
  const skipPlanning = usePreferencesStore((state) => state.skipPlanning);
  const { data: savedFlowSummaries = [] } = useSavedFlows();
  const latestRunReport = useFlowSessionStore((state) => state.latestRunReport);
  const liveViewUrl = useFlowSessionStore((state) => state.liveViewUrl);
  const planningProvider = usePreferencesStore((state) => state.planningProvider);
  const planningModel = usePreferencesStore((state) => state.planningModel);
  const resolvedPlanningProvider = useFlowSessionStore((state) => state.resolvedPlanningProvider);
  switch (screen) {
    case "main": {
      const hints: HintSegment[] = [
        {
          key: "shift+tab",
          label: `skip planning ${skipPlanning ? "on" : "off"}`,
          color: skipPlanning ? COLORS.GREEN : undefined,
        },
      ];
      if (savedFlowSummaries.length > 0) {
        hints.push({
          key: "ctrl+r",
          label: "reuse flow",
          onClick: () => navigateTo("saved-flow-picker"),
        });
      }
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
    case "planning": {
      const planningHints: HintSegment[] = [];
      const provider = resolvedPlanningProvider ?? planningProvider;
      const providerName =
        provider === "claude"
          ? "Claude"
          : provider === "codex"
            ? "Codex"
            : provider === "cursor"
              ? "Cursor"
              : null;
      if (providerName) {
        planningHints.push({
          key: providerName + (planningModel ? ` · ${planningModel}` : ""),
          label: "agent",
        });
      }
      return [...planningHints, { key: "esc", label: "cancel", cta: true, onClick: goBack }];
    }
    case "review-plan":
      return [
        { key: "↑↓", label: "nav" },
        { key: "tab", label: "fold" },
        { key: "s", label: "save plan" },
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
      const resultsHints: HintSegment[] = [];
      const videoPath = latestRunReport?.artifacts.rawVideoPath;
      if (videoPath) {
        resultsHints.push({ key: "v", label: "open video" });
      }
      if (latestRunReport?.artifacts.highlightVideoPath) {
        resultsHints.push({ key: "h", label: "highlight reel" });
      }
      if (latestRunReport?.artifacts.shareUrl) {
        resultsHints.push({ key: "o", label: "open report" });
      }
      return [
        ...resultsHints,
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
