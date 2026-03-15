import { Text } from "ink";
import { useColors } from "../theme-context.js";
import type { DiffStats } from "@browser-tester/supervisor";

interface MenuItemProps {
  label: string;
  detail: string;
  isSelected: boolean;
  recommended?: boolean;
  hint?: string;
  diffStats?: DiffStats | null;
}

export const MenuItem = ({
  label,
  detail,
  isSelected,
  recommended,
  hint,
  diffStats,
}: MenuItemProps) => {
  const COLORS = useColors();

  if (isSelected) {
    return (
      <Text>
        <Text color={COLORS.PRIMARY}>{"▸ "}</Text>
        <Text color={COLORS.PRIMARY} bold>
          {label}
        </Text>
        {diffStats ? (
          <Text color={COLORS.DIM}>
            {" "}
            +{diffStats.additions} -{diffStats.deletions}
          </Text>
        ) : null}
        {recommended ? <Text color={COLORS.DIM}> [recommended]</Text> : null}
        {hint ? <Text color={COLORS.DIM}> [{hint}]</Text> : null}
      </Text>
    );
  }

  return (
    <Text>
      <Text color={COLORS.DIM}>{"  "}</Text>
      <Text color={COLORS.DIM}>{label}</Text>
      {detail ? <Text color={COLORS.DIM}> {detail}</Text> : null}
    </Text>
  );
};
