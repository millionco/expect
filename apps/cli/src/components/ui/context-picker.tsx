import { Box, Text, useInput } from "ink";
import { useColors } from "../theme-context.js";
import { RuledBox } from "./ruled-box.js";
import { testContextId, type GitState, type TestContext } from "@browser-tester/shared/models";
import { getContextLabel, getContextDescription } from "../../utils/context-options.js";
import { CONTEXT_PICKER_VISIBLE_COUNT } from "../../constants.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import figures from "figures";

interface ContextPickerProps {
  readonly options: TestContext[];
  readonly selectedIndex: number;
  readonly isLoading: boolean;
  readonly query: string;
  readonly gitState: GitState | null;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (option: TestContext) => void;
  readonly onNavigate: (index: number) => void;
  readonly onDismiss: () => void;
}

const StatusDot = ({ status }: { readonly status?: string | null }) => {
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
  gitState,
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
        const label = getContextLabel(option, gitState);
        const description = getContextDescription(option, gitState);
        const prNumber =
          option._tag === "PullRequest" || option._tag === "Branch" ? option.branch.prNumber : null;
        const prStatus =
          option._tag === "PullRequest" || option._tag === "Branch" ? option.branch.prStatus : null;

        return (
          <Box key={testContextId(option)}>
            <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
              {isSelected ? `${figures.pointer} ` : "  "}
            </Text>
            {option._tag === "WorkingTree" ? (
              <Text color={COLORS.GREEN}>{figures.bullet} </Text>
            ) : null}
            {prStatus ? <StatusDot status={prStatus} /> : null}
            <Text color={isSelected ? COLORS.PRIMARY : COLORS.TEXT} bold={isSelected}>
              {label}
            </Text>
            {prNumber ? (
              <Text>
                {" "}
                <Text
                  color={
                    prStatus === "open"
                      ? COLORS.GREEN
                      : prStatus === "merged"
                        ? COLORS.PURPLE
                        : COLORS.DIM
                  }
                >
                  #{prNumber}
                </Text>
                {prStatus ? <Text color={COLORS.DIM}> {prStatus}</Text> : null}
              </Text>
            ) : null}
            {description && !prNumber ? <Text color={COLORS.DIM}> {description}</Text> : null}
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
