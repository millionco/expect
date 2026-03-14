import { Box, Text } from "ink";
import { useColors } from "../theme-context.js";

interface ErrorMessageProps {
  message: string | null | undefined;
}

export const ErrorMessage = ({ message }: ErrorMessageProps) => {
  if (!message) return null;

  const COLORS = useColors();

  return (
    <Box marginTop={1}>
      <Text color={COLORS.RED}>{message}</Text>
    </Box>
  );
};
