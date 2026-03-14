import { Box, Text } from "ink";
import { Spinner } from "./ui/spinner.js";
import { ScreenHeading } from "./ui/screen-heading.js";
import { useColors } from "./theme-context.js";
import { useAppStore } from "../store.js";
import type { TestAction } from "../utils/browser-agent.js";

const ACTION_LABELS: Record<TestAction, string> = {
  "test-unstaged": "Test unstaged changes",
  "test-branch": "Test entire branch",
  "select-commit": "Select a commit to test",
};

export const PlanningScreen = () => {
  const COLORS = useColors();
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const testAction = useAppStore((state) => state.testAction);

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <ScreenHeading
        title={
          testAction ? ACTION_LABELS[testAction] : "Generating browser plan"
        }
      />

      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={COLORS.BORDER}
        paddingX={2}
      >
        <Text color={COLORS.DIM}>{flowInstruction}</Text>
      </Box>

      <Box marginTop={1}>
        <Spinner message="Planning with scope-aware git context..." />
      </Box>
    </Box>
  );
};
