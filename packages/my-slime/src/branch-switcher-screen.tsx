import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { COLORS, SEARCH_PLACEHOLDER } from "./constants.js";
import { fetchLocalBranches } from "./utils/fetch-local-branches.js";
import { fetchRemoteBranches, type RemoteBranch } from "./utils/fetch-remote-branches.js";
import { Spinner } from "./spinner.js";
import { PrFilterBar, PR_FILTERS, type PrFilter } from "./pr-filter.js";

type Tab = "local" | "remote";

interface BranchSwitcherScreenProps {
  onSelect: (branch: string) => void;
}

const PrBadge = ({ branch }: { branch: RemoteBranch }) => {
  if (!branch.prNumber || !branch.prStatus) return null;

  const colorMap = {
    open: COLORS.GREEN,
    draft: COLORS.DIM,
    merged: COLORS.PURPLE,
  } as const;

  return (
    <Text color={colorMap[branch.prStatus]}>
      {` PR #${branch.prNumber} (${branch.prStatus})`}
    </Text>
  );
};

const matchesFilter = (branch: RemoteBranch, filter: PrFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "no-pr") return branch.prStatus === null;
  return branch.prStatus === filter;
};

export const BranchSwitcherScreen = ({ onSelect }: BranchSwitcherScreenProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("local");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [activeFilter, setActiveFilter] = useState<PrFilter>("all");

  const [localBranches] = useState(() => fetchLocalBranches());
  const [remoteBranches, setRemoteBranches] = useState<RemoteBranch[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(true);
  const [hasFetchedRemote, setHasFetchedRemote] = useState(false);

  useEffect(() => {
    if (activeTab !== "remote" || hasFetchedRemote) return;
    setHasFetchedRemote(true);
    fetchRemoteBranches().then((branches) => {
      setRemoteBranches(branches);
      setIsLoadingRemote(false);
    });
  }, [activeTab, hasFetchedRemote]);

  const filteredLocalBranches = useMemo(() => {
    if (!searchQuery) return localBranches;
    const lower = searchQuery.toLowerCase();
    return localBranches.filter((branch) => branch.toLowerCase().includes(lower));
  }, [localBranches, searchQuery]);

  const filteredRemoteBranches = useMemo(() => {
    let result = remoteBranches.filter((branch) => matchesFilter(branch, activeFilter));
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter((branch) => branch.name.toLowerCase().includes(lower));
    }
    return result;
  }, [remoteBranches, searchQuery, activeFilter]);

  const maxBranchWidth = useMemo(
    () => Math.max(...filteredRemoteBranches.map((branch) => branch.name.length), 0),
    [filteredRemoteBranches],
  );

  const maxAuthorWidth = useMemo(
    () => Math.max(...filteredRemoteBranches.map((branch) => branch.author.length), 0),
    [filteredRemoteBranches],
  );

  const handleInput = useCallback((value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  }, []);

  const cycleFilter = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = PR_FILTERS.indexOf(activeFilter);
      const nextIndex = (currentIndex + direction + PR_FILTERS.length) % PR_FILTERS.length;
      setActiveFilter(PR_FILTERS[nextIndex]);
      setHighlightedIndex(0);
    },
    [activeFilter],
  );

  useInput((_input, key) => {
    if (key.tab) {
      setActiveTab((previous) => (previous === "local" ? "remote" : "local"));
      setHighlightedIndex(0);
      setSearchQuery("");
      return;
    }

    if (key.downArrow) {
      const max =
        activeTab === "local" ? filteredLocalBranches.length - 1 : filteredRemoteBranches.length - 1;
      setHighlightedIndex((previous) => Math.min(max, previous + 1));
    }
    if (key.upArrow) {
      setHighlightedIndex((previous) => Math.max(0, previous - 1));
    }

    if (activeTab === "remote") {
      if (key.rightArrow) cycleFilter(1);
      if (key.leftArrow) cycleFilter(-1);
    }

    if (key.return) {
      if (activeTab === "local" && filteredLocalBranches.length > 0) {
        onSelect(filteredLocalBranches[highlightedIndex]);
      }
      if (activeTab === "remote" && filteredRemoteBranches.length > 0) {
        onSelect(filteredRemoteBranches[highlightedIndex].name);
      }
    }
  });

  const isCurrentTabLoading = activeTab === "remote" && isLoadingRemote;

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
      <Box flexDirection="row" gap={2}>
        <Text color={activeTab === "local" ? COLORS.SELECTION : COLORS.DIM} bold={activeTab === "local"}>
          {activeTab === "local" ? "[Local]" : " Local "}
        </Text>
        <Text color={activeTab === "remote" ? COLORS.SELECTION : COLORS.DIM} bold={activeTab === "remote"}>
          {activeTab === "remote" ? "[Remote]" : " Remote "}
        </Text>
        {activeTab === "local" && (
          <Text color={COLORS.DIM}>({filteredLocalBranches.length})</Text>
        )}
      </Box>

      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={COLORS.DIVIDER}
      />

      {isCurrentTabLoading ? (
        <Box marginTop={1}>
          <Spinner message="Fetching remote branches..." />
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {activeTab === "remote" && <PrFilterBar activeFilter={activeFilter} />}

          <Box flexDirection="column" marginTop={activeTab === "remote" ? 1 : 0}>
            {activeTab === "local" &&
              filteredLocalBranches.map((branch, index) => (
                <Text key={branch} color={index === highlightedIndex ? COLORS.SELECTION : COLORS.TEXT}>
                  {index === highlightedIndex ? `➤ ${branch}` : `  ${branch}`}
                </Text>
              ))}

            {activeTab === "remote" &&
              filteredRemoteBranches.map((branch, index) => (
                <Text key={branch.name} color={index === highlightedIndex ? COLORS.SELECTION : COLORS.TEXT}>
                  {index === highlightedIndex ? "➤ " : "  "}
                  {branch.name.padEnd(maxBranchWidth + 2)}
                  {branch.author && (
                    <Text color={COLORS.YELLOW}>{branch.author.padEnd(maxAuthorWidth + 2)}</Text>
                  )}
                  <PrBadge branch={branch} />
                </Text>
              ))}

            {((activeTab === "local" && filteredLocalBranches.length === 0) ||
              (activeTab === "remote" && filteredRemoteBranches.length === 0)) && (
              <Text color={COLORS.DIM}>No matching branches</Text>
            )}
          </Box>
        </Box>
      )}

      {!isCurrentTabLoading && (
        <Box marginTop={2} borderStyle="round" borderColor={COLORS.BORDER} paddingX={2}>
          <TextInput
            focus
            placeholder={SEARCH_PLACEHOLDER}
            value={searchQuery}
            onChange={handleInput}
          />
        </Box>
      )}

      <Text color={COLORS.DIM}>
        {isCurrentTabLoading
          ? "Tab to switch · Esc to go back"
          : activeTab === "remote"
            ? "↑/↓ navigate · ←/→ filter · Tab to switch · Enter select · Esc back"
            : "↑/↓ navigate · Tab to switch · Enter select · Esc back"}
      </Text>
    </Box>
  );
};
