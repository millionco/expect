import { Box, Text } from "ink";
import figures from "figures";
import { useColors } from "../theme-context.js";
import { Clickable } from "./clickable.js";
import type { ReactNode } from "react";

interface CollapsibleProps {
  label: string;
  count?: number;
  selected?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const Collapsible = ({
  label,
  count,
  selected = false,
  open,
  onToggle,
  children,
}: CollapsibleProps) => {
  const COLORS = useColors();
  const indicatorColor = selected ? COLORS.ORANGE : COLORS.DIM;
  const contentColor = selected ? COLORS.TEXT : COLORS.DIM;
  const arrow = open ? figures.triangleDown : figures.triangleRight;
  const countSuffix = count !== undefined ? ` (${count})` : "";

  return (
    <Box flexDirection="column">
      <Clickable onClick={onToggle}>
        <Text>
          <Text color={indicatorColor}>{selected ? "❯ " : "  "}</Text>
          <Text color={contentColor}>{arrow} </Text>
          <Text bold color={contentColor}>
            {label}
            {countSuffix}
          </Text>
        </Text>
      </Clickable>
      {open ? children : null}
    </Box>
  );
};
