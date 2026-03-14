import { Box, Text } from "ink";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";
import stringWidth from "string-width";
import { useThemeContext } from "./theme-context.js";
import { STATUSBAR_BRANCH_PADDING, STATUSBAR_TRAILING_PADDING } from "../constants.js";
import { visualPadEnd } from "../utils/visual-pad-end.js";
import { useAppStore, type Screen } from "../store.js";

const SCREEN_HINTS: Record<Screen, string> = {
  main: "t theme · b branch · ↑↓ nav",
  "switch-branch": "↑↓ nav · tab local/remote · / search · enter select · esc back",
  "select-commit": "↑↓ nav · enter select · / search · esc back",
  "saved-flow-picker": "↑↓ nav · enter select · esc back",
  "flow-input": "enter submit · esc back",
  planning: "esc cancel",
  "review-plan": "↑↓ nav · tab fold · e edit · s save · a approve · esc back",
  testing: "",
  theme: "↑↓ nav · tab light/dark · enter select · esc cancel",
};

export const Modeline = () => {
  const [columns] = useStdoutDimensions();
  const { theme } = useThemeContext();
  const gitState = useAppStore((state) => state.gitState);
  const screen = useAppStore((state) => state.screen);
  const savedFlowSummaries = useAppStore((state) => state.savedFlowSummaries);

  if (!gitState) return null;

  const hints =
    screen === "main" && savedFlowSummaries.length > 0
      ? "t theme · b branch · r reuse flow · ↑↓ nav"
      : SCREEN_HINTS[screen] ?? "";
  const remaining =
    columns -
    STATUSBAR_BRANCH_PADDING -
    stringWidth(gitState.currentBranch) -
    STATUSBAR_TRAILING_PADDING;

  return (
    <Box>
      <Text backgroundColor={theme.primary} color="#000000" bold>
        {" "}
        {gitState.currentBranch}{" "}
      </Text>
      <Text backgroundColor={theme.border} color={theme.text}>
        {visualPadEnd(hints ? ` ${hints}` : "", remaining)}
      </Text>
    </Box>
  );
};
