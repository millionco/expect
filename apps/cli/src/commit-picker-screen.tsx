import { useCallback, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { COLUMN_PADDING, SEARCH_PLACEHOLDER, VISIBLE_COMMIT_COUNT } from "./constants.js";
import { useColors } from "./theme-context.js";
import { fetchCommits } from "./utils/fetch-commits.js";
import { useAppStore } from "./store.js";

export const CommitPickerScreen = () => {
  const selectCommit = useAppStore((state) => state.selectCommit);
  const COLORS = useColors();
  const [commits] = useState(() => fetchCommits());
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const filteredCommits = useMemo(() => {
    if (!searchQuery) return commits;
    const lower = searchQuery.toLowerCase();
    return commits.filter(
      (commit) =>
        commit.subject.toLowerCase().includes(lower) ||
        commit.shortHash.toLowerCase().includes(lower) ||
        commit.author.toLowerCase().includes(lower),
    );
  }, [commits, searchQuery]);

  const maxHashWidth = useMemo(
    () => Math.max(...filteredCommits.map((commit) => commit.shortHash.length), 0) + COLUMN_PADDING,
    [filteredCommits],
  );

  const scrollOffset = useMemo(() => {
    if (filteredCommits.length <= VISIBLE_COMMIT_COUNT) return 0;
    const half = Math.floor(VISIBLE_COMMIT_COUNT / 2);
    const maxOffset = filteredCommits.length - VISIBLE_COMMIT_COUNT;
    return Math.min(maxOffset, Math.max(0, highlightedIndex - half));
  }, [filteredCommits.length, highlightedIndex]);

  const visibleCommits = filteredCommits.slice(scrollOffset, scrollOffset + VISIBLE_COMMIT_COUNT);

  const handleInput = useCallback((value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  }, []);

  useInput((input, key) => {
    if (key.downArrow || (key.ctrl && input === "n")) {
      setHighlightedIndex((previous) => Math.min(filteredCommits.length - 1, previous + 1));
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setHighlightedIndex((previous) => Math.max(0, previous - 1));
    }
    if (key.return && filteredCommits.length > 0) {
      selectCommit(filteredCommits[highlightedIndex]);
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
      <Text color={COLORS.TEXT}>
        <Text bold>Select a commit to test</Text>
        <Text color={COLORS.DIM}> ({filteredCommits.length})</Text>
      </Text>

      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={COLORS.DIVIDER}
      />

      <Box flexDirection="column" marginTop={1} height={VISIBLE_COMMIT_COUNT} overflow="hidden">
        {visibleCommits.map((commit, index) => {
          const actualIndex = index + scrollOffset;
          return (
            <Text
              key={commit.hash}
              color={actualIndex === highlightedIndex ? COLORS.SELECTION : COLORS.TEXT}
            >
              {actualIndex === highlightedIndex ? "➤ " : "  "}
              <Text color={COLORS.YELLOW}>{commit.shortHash.padEnd(maxHashWidth)}</Text>
              <Text color={actualIndex === highlightedIndex ? COLORS.SELECTION : COLORS.TEXT}>
                {commit.subject}
              </Text>
              <Text color={COLORS.DIM}> {commit.relativeDate}</Text>
            </Text>
          );
        })}
        {filteredCommits.length === 0 && <Text color={COLORS.DIM}>No matching commits</Text>}
      </Box>

      <Box marginTop={2} borderStyle="round" borderColor={COLORS.BORDER} paddingX={2}>
        <TextInput
          focus
          placeholder={SEARCH_PLACEHOLDER}
          value={searchQuery}
          onChange={handleInput}
        />
      </Box>

      <Text color={COLORS.DIM}>↑/↓ navigate · Enter select · Esc back</Text>
    </Box>
  );
};
