import { Box, Text } from "ink";
import { useColors } from "../theme-context";
import { Clickable } from "./clickable";
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
  const arrow = open ? "─" : "+";
  const upperLabel = label.toUpperCase();
  const countSuffix = count !== undefined ? ` [${count}]` : "";

  return (
    <Box flexDirection="column">
      <Clickable onClick={onToggle}>
        <Text>
          <Text color={selected ? COLORS.PRIMARY : COLORS.DIM}>{arrow} </Text>
          <Text bold={selected} color={contentColor}>
            {upperLabel}
            {countSuffix}
          </Text>
        </Text>
      </Clickable>
      {open ? (
        <Box flexDirection="column" paddingLeft={2}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
};
