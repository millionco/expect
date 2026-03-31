import { Box, Text } from "ink";
import figures from "figures";
import { useColors } from "../theme-context";
import { VERSION } from "../../constants";

export const Logo = () => {
  const COLORS = useColors();

  return (
    <Box>
      <Text color={COLORS.BORDER}>
        <Text color={COLORS.RED}>{figures.cross}</Text>
        <Text color={COLORS.GREEN}>{figures.tick}</Text>
        <Text bold color={COLORS.PRIMARY}>
          {" Expect"}
        </Text>
        <Text color={COLORS.DIM}>{` v${VERSION}`}</Text>
      </Text>
    </Box>
  );
};
