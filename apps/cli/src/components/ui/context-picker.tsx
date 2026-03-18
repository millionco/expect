import { Box, Text, useInput } from "ink";
import { useColors } from "../theme-context";
import { RuledBox } from "./ruled-box";
import type { ContextOption } from "../../utils/context-options";
import { CONTEXT_PICKER_VISIBLE_COUNT } from "../../constants";
import { stripMouseSequences } from "../../hooks/mouse-context";
import figures from "figures";

interface ContextPickerProps {
  readonly options: ContextOption[];
  readonly selectedIndex: number;
  readonly isLoading: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (option: ContextOption) => void;
  readonly onNavigate: (index: number) => void;
  readonly onDismiss: () => void;
}

const StatusDot = ({ status }: { readonly status?: string }) => {
  const COLORS = useColors();
  if (status === "open") return <Text color={COLORS.GREEN}>{figures.bullet} </Text>;
  if (status === "merged") return <Text color={COLORS.PURPLE}>{figures.bullet} </Text>;
  if (status === "draft") return <Text color={COLORS.DIM}>{figures.bullet} </Text>;
  return null;
};

export const ContextPicker = ({
  options,
  selectedIndex,
  isLoading,
  onSelect,
  onNavigate,
  query,
  onQueryChange,
  onDismiss,
}: ContextPickerProps) => {
  const COLORS = useColors();

  useInput((input, key) => {
    if (key.escape) {
      onDismiss();
      return;
    }

    if (key.downArrow || (key.ctrl && input === "n")) {
      onNavigate(Math.min(options.length - 1, selectedIndex + 1));
      return;
    }

    if (key.upArrow || (key.ctrl && input === "p")) {
      onNavigate(Math.max(0, selectedIndex - 1));
      return;
    }

    if (key.return || key.tab) {
      const selected = options[selectedIndex];
      if (selected) onSelect(selected);
      return;
    }

    if (key.backspace || key.delete) {
      if (query.length === 0) {
        onDismiss();
      } else {
        onQueryChange(query.slice(0, -1));
      }
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const cleaned = stripMouseSequences(input);
      if (cleaned) onQueryChange(query + cleaned);
    }
  });

  const scrollOffset = (() => {
    if (options.length <= CONTEXT_PICKER_VISIBLE_COUNT) return 0;
    const half = Math.floor(CONTEXT_PICKER_VISIBLE_COUNT / 2);
    const maxOffset = options.length - CONTEXT_PICKER_VISIBLE_COUNT;
    return Math.min(maxOffset, Math.max(0, selectedIndex - half));
  })();

  const visibleOptions = options.slice(scrollOffset, scrollOffset + CONTEXT_PICKER_VISIBLE_COUNT);

  if (options.length === 0 && !isLoading) {
    return (
      <RuledBox color={COLORS.BORDER}>
        <Text color={COLORS.DIM}>No matching results</Text>
      </RuledBox>
    );
  }

  return (
    <RuledBox color={COLORS.PRIMARY}>
      {visibleOptions.map((option, index) => {
        const actualIndex = index + scrollOffset;
        const isSelected = actualIndex === selectedIndex;

        return (
          <Box key={option.id}>
            <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
              {isSelected ? `${figures.pointer} ` : "  "}
            </Text>
            {option.type === "changes" ? <Text color={COLORS.GREEN}>{figures.bullet} </Text> : null}
            {option.prStatus ? <StatusDot status={option.prStatus} /> : null}
            <Text color={isSelected ? COLORS.PRIMARY : COLORS.TEXT} bold={isSelected}>
              {option.label}
            </Text>
            {option.prNumber ? (
              <Text>
                {" "}
                <Text
                  color={
                    option.prStatus === "open"
                      ? COLORS.GREEN
                      : option.prStatus === "merged"
                        ? COLORS.PURPLE
                        : COLORS.DIM
                  }
                >
                  #{option.prNumber}
                </Text>
                {option.prStatus ? <Text color={COLORS.DIM}> {option.prStatus}</Text> : null}
              </Text>
            ) : null}
            {option.description && !option.prNumber ? (
              <Text color={COLORS.DIM}> {option.description}</Text>
            ) : null}
          </Box>
        );
      })}
      {isLoading ? (
        <Box>
          <Text color={COLORS.DIM}> Loading PRs and branches{figures.ellipsis}</Text>
        </Box>
      ) : null}
      {options.length > CONTEXT_PICKER_VISIBLE_COUNT ? (
        <Box>
          <Text color={COLORS.DIM}>
            {"  "}
            {options.length - CONTEXT_PICKER_VISIBLE_COUNT} more {figures.arrowUp}/
            {figures.arrowDown}
          </Text>
        </Box>
      ) : null}
    </RuledBox>
  );
};
