import { useCallback, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { COLORS, SEARCH_PLACEHOLDER } from "./constants.js";
import { fetchCommits, type Commit } from "./utils/fetch-commits.js";

interface CommitPickerScreenProps {
  onSelect: (commit: Commit) => void;
}

export const CommitPickerScreen = ({ onSelect }: CommitPickerScreenProps) => {
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
    () => Math.max(...filteredCommits.map((commit) => commit.shortHash.length), 0),
    [filteredCommits],
  );

  const handleInput = useCallback((value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  }, []);

  useInput((_input, key) => {
    if (key.downArrow) {
      setHighlightedIndex((previous) => Math.min(filteredCommits.length - 1, previous + 1));
    }
    if (key.upArrow) {
      setHighlightedIndex((previous) => Math.max(0, previous - 1));
    }
    if (key.return && filteredCommits.length > 0) {
      onSelect(filteredCommits[highlightedIndex]);
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

      <Box flexDirection="column" marginTop={1}>
        {filteredCommits.map((commit, index) => (
          <Text key={commit.hash} color={index === highlightedIndex ? COLORS.SELECTION : COLORS.TEXT}>
            {index === highlightedIndex ? "➤ " : "  "}
            <Text color={COLORS.YELLOW}>{commit.shortHash.padEnd(maxHashWidth + 1)}</Text>
            <Text color={index === highlightedIndex ? COLORS.SELECTION : COLORS.TEXT}>
              {commit.subject}
            </Text>
            <Text color={COLORS.DIM}> {commit.relativeDate}</Text>
          </Text>
        ))}
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

      <Text color={COLORS.DIM}>
        ↑/↓ navigate · Enter select · Esc back
      </Text>
    </Box>
  );
};
