import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Spinner } from "../ui/spinner.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import { useColors } from "../theme-context.js";
import { useAppStore } from "../../store.js";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { TESTING_TIMER_UPDATE_INTERVAL_MS } from "../../constants.js";
import type { TestAction } from "../../utils/browser-agent.js";

const ACTION_LABELS: Record<TestAction, string> = {
  "test-unstaged": "Test current changes",
  "test-branch": "Test entire branch",
  "select-commit": "Test commit",
};

export const PlanningScreen = () => {
  const COLORS = useColors();
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const testAction = useAppStore((state) => state.testAction);
  const planningStatus = useAppStore((state) => state.planningStatus);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [startTime]);

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
        <Spinner message={planningStatus ?? "Generating browser plan..."} />
        <Text color={COLORS.DIM}> {formatElapsedTime(elapsed)}</Text>
      </Box>
    </Box>
  );
};
