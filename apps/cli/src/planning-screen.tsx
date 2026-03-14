import { Box, Text } from "ink";
import { useColors } from "./theme-context.js";
import { Spinner } from "./spinner.js";
import { useAppStore } from "./store.js";

export const PlanningScreen = () => {
  const COLORS = useColors();
  const flowInstruction = useAppStore((state) => state.flowInstruction);

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
      <Text bold color={COLORS.TEXT}>
        Generating browser plan
      </Text>
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={COLORS.DIVIDER}
      />
      <Box marginTop={1}>
        <Text color={COLORS.DIM}>{flowInstruction}</Text>
      </Box>
      <Box marginTop={1}>
        <Spinner message="Planning with scope-aware git context..." />
      </Box>
    </Box>
  );
};
