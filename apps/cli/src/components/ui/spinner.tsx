import { Text } from "ink";
import InkSpinner from "ink-spinner";
import { useColors } from "../theme-context";

interface SpinnerProps {
  message?: string;
}

export const Spinner = ({ message }: SpinnerProps) => {
  const COLORS = useColors();

  return (
    <Text color={COLORS.DIM}>
      <Text color={COLORS.SELECTION}>
        <InkSpinner type="dots" />
      </Text>
      {message ? <Text> {message}</Text> : null}
    </Text>
  );
};
