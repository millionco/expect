import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { Spinner } from "../ui/spinner.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { useAppStore } from "../../store.js";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { TESTING_TIMER_UPDATE_INTERVAL_MS } from "../../constants.js";

const PLANNING_STAGES = [
  { after: 0, label: "Analyzing changes" },
  { after: 1200, label: "Reading diff" },
  { after: 2400, label: "Identifying test surfaces" },
  { after: 3600, label: "Mapping component boundaries" },
  { after: 4800, label: "Building browser steps" },
  { after: 6000, label: "Sequencing navigation flow" },
  { after: 7200, label: "Defining expected outcomes" },
  { after: 8400, label: "Checking assertions" },
  { after: 9600, label: "Validating plan" },
  { after: 11000, label: "Finalizing" },
] as const;

const getStageLabel = (elapsed: number): (typeof PLANNING_STAGES)[number]["label"] => {
  let label: (typeof PLANNING_STAGES)[number]["label"] = PLANNING_STAGES[0].label;
  for (const stage of PLANNING_STAGES) {
    if (elapsed >= stage.after) label = stage.label;
  }
  return label;
};

export const PlanningScreen = () => {
  const COLORS = useColors();
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const selectedContext = useAppStore((state) => state.selectedContext);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [startTime]);

  const stageLabel = getStageLabel(elapsed);

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      {selectedContext ? (
        <Box paddingX={1}>
          <Text color={COLORS.DIM}>{selectedContext.label}</Text>
        </Box>
      ) : null}
      <RuledBox color={COLORS.BORDER}>
        <Text color={COLORS.DIM}>{flowInstruction}</Text>
      </RuledBox>

      <Box marginTop={1} paddingX={1}>
        <Spinner />
        <Text color={COLORS.DIM}>
          {` ${stageLabel}${figures.ellipsis} `}
          <Text color={COLORS.BORDER}>{formatElapsedTime(elapsed)}</Text>
        </Text>
      </Box>
    </Box>
  );
};
