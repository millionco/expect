import { Box, Text } from "ink";
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
  const contentColor = selected ? COLORS.TEXT : COLORS.DIM;
  const indicator = open ? "[-]" : "[+]";
  const countSuffix = count !== undefined ? ` (${count})` : "";

  return (
    <Box flexDirection="column">
      <Clickable onClick={onToggle}>
        <Text>
          <Text color={selected ? COLORS.PRIMARY : COLORS.DIM}>
            {selected ? "  ▸ " : "    "}
          </Text>
          <Text color={contentColor}>{indicator} </Text>
          <Text bold={selected} color={contentColor}>
            {label.toUpperCase()}
            {countSuffix}
          </Text>
        </Text>
      </Clickable>
      {open ? children : null}
    </Box>
  );
};
