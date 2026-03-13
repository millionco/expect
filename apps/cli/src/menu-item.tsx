import { Text } from "ink";
import { COLORS } from "./constants.js";

interface MenuItemProps {
  label: string;
  detail: string;
  isSelected: boolean;
  recommended?: boolean;
  hint?: string;
}

export const MenuItem = ({ label, detail, isSelected, recommended, hint }: MenuItemProps) => {
  return (
    <Text>
      <Text color={isSelected ? COLORS.ORANGE : COLORS.DIM}>{isSelected ? "▶ " : "  "}</Text>
      <Text color={isSelected ? "whiteBright" : COLORS.DIM} bold={isSelected}>{label}</Text>
      {detail ? <Text color={COLORS.DIM}> {detail}</Text> : null}
      {recommended && <Text color={COLORS.DIM}> (recommended)</Text>}
      {hint && <Text color={COLORS.DIM}> ({hint})</Text>}
    </Text>
  );
};
