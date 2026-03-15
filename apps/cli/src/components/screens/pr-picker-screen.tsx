import { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import figures from "figures";
import {
  BRANCH_NAME_COLUMN_WIDTH,
  BRANCH_AUTHOR_COLUMN_WIDTH,
  BRANCH_VISIBLE_COUNT,
  COMMIT_SELECTOR_WIDTH,
  TABLE_COLUMN_GAP,
} from "../../constants.js";
import { useColors } from "../theme-context.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import { Clickable } from "../ui/clickable.js";
import { SearchBar } from "../ui/search-bar.js";
import {
  fetchRemoteBranches,
  type RemoteBranch,
} from "../../utils/fetch-remote-branches.js";
import { Spinner } from "../ui/spinner.js";
import { truncateText } from "../../utils/truncate-text.js";
import { visualPadEnd } from "../../utils/visual-pad-end.js";
import { useScrollableList } from "../../hooks/use-scrollable-list.js";
import { useAppStore } from "../../store.js";
import { ScreenHeading } from "../ui/screen-heading.js";

type PrFilter = "recent" | "all" | "open" | "draft" | "merged" | "no-pr";

const PR_FILTERS: PrFilter[] = [
  "recent",
  "all",
  "open",
  "draft",
  "merged",
  "no-pr",
];

export const PrPickerScreen = () => {
  const [columns] = useStdoutDimensions();
  const storeSwitchBranch = useAppStore((state) => state.switchBranch);
  const checkoutError = useAppStore((state) => state.checkoutError);
  const clearCheckoutError = useAppStore((state) => state.clearCheckoutError);
  const COLORS = useColors();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PrFilter>("recent");
  const [isSearching, setIsSearching] = useState(false);

  const [remoteBranches, setRemoteBranches] = useState<RemoteBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRemoteBranches()
      .then((branches) => {
        if (!cancelled) setRemoteBranches(branches);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBranches = (() => {
    let result = remoteBranches.filter((branch) => {
      if (activeFilter === "recent" || activeFilter === "all") return true;
      if (activeFilter === "no-pr") return branch.prStatus === null;
      return branch.prStatus === activeFilter;
    });
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      result = result.filter((branch) =>
        branch.name.toLowerCase().includes(lowercaseQuery)
      );
    }
    if (activeFilter === "recent") {
      result = result
        .filter((branch) => branch.updatedAt !== null)
        .sort((first, second) => {
          const firstDate = new Date(first.updatedAt ?? 0).getTime();
          const secondDate = new Date(second.updatedAt ?? 0).getTime();
          return secondDate - firstDate;
        });
    }
    return result;
  })();

  const {
    highlightedIndex,
    setHighlightedIndex,
    scrollOffset,
    handleNavigation,
  } = useScrollableList({
    itemCount: filteredBranches.length,
    visibleCount: BRANCH_VISIBLE_COUNT,
  });

  const prColumnWidth =
    columns -
    COMMIT_SELECTOR_WIDTH -
    BRANCH_NAME_COLUMN_WIDTH -
    BRANCH_AUTHOR_COLUMN_WIDTH -
    TABLE_COLUMN_GAP;

  const visibleItems = filteredBranches.slice(
    scrollOffset,
    scrollOffset + BRANCH_VISIBLE_COUNT
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(stripMouseSequences(value));
      setHighlightedIndex(0);
    },
    [setHighlightedIndex]
  );

  const cycleFilter = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = PR_FILTERS.indexOf(activeFilter);
      const nextIndex =
        (currentIndex + direction + PR_FILTERS.length) % PR_FILTERS.length;
      setActiveFilter(PR_FILTERS[nextIndex]);
      setHighlightedIndex(0);
    },
    [activeFilter, setHighlightedIndex]
  );

  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
      }
      return;
    }

    if (handleNavigation(input, key)) return;

    if (key.rightArrow) cycleFilter(1);
    if (key.leftArrow) cycleFilter(-1);

    if (key.return) {
      const selected = filteredBranches[highlightedIndex];
      if (selected) {
        clearCheckoutError();
        storeSwitchBranch(selected.name, selected.prNumber);
      }
    }

    if (input === "/") {
      setIsSearching(true);
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <ScreenHeading
        title="Select a PR or branch to test"
        subtitle={`${filteredBranches.length} branches`}
      />

      <Box marginTop={1}>
        {PR_FILTERS.map((filter, index) => {
          const isActive = filter === activeFilter;
          const separator = index < PR_FILTERS.length - 1 ? " · " : "";
          const filterColors: Record<PrFilter, string> = {
            recent: COLORS.CYAN,
            all: COLORS.TEXT,
            open: COLORS.GREEN,
            draft: COLORS.DIM,
            merged: COLORS.PURPLE,
            "no-pr": COLORS.YELLOW,
          };
          return (
            <Box key={filter}>
              <Clickable
                fullWidth={false}
                onClick={() => {
                  setActiveFilter(filter);
                  setHighlightedIndex(0);
                }}
              >
                <Text color={isActive ? filterColors[filter] : COLORS.DIM}>
                  {isActive ? `[${filter}]` : filter}
                </Text>
              </Clickable>
              <Text color={COLORS.DIM}>{separator}</Text>
            </Box>
          );
        })}
      </Box>

      {isLoading ? (
        <Box marginTop={1}>
          <Spinner message="Fetching PRs..." />
        </Box>
      ) : (
        <Box
          marginTop={1}
          flexDirection="column"
          height={BRANCH_VISIBLE_COUNT}
          overflow="hidden"
        >
          {visibleItems.map((branch, index) => {
            const actualIndex = index + scrollOffset;
            const isSelected = actualIndex === highlightedIndex;

            return (
              <Clickable
                key={branch.name}
                onClick={() => {
                  setHighlightedIndex(actualIndex);
                  storeSwitchBranch(branch.name);
                }}
              >
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                  {isSelected ? `${figures.pointer} ` : "  "}
                </Text>
                <Text
                  color={isSelected ? COLORS.PRIMARY : COLORS.DIM}
                  bold={isSelected}
                >
                  {visualPadEnd(
                    truncateText(branch.name, BRANCH_NAME_COLUMN_WIDTH - 1),
                    BRANCH_NAME_COLUMN_WIDTH
                  )}
                </Text>
                <Text color={COLORS.CYAN}>
                  {visualPadEnd(
                    truncateText(
                      branch.author || "—",
                      BRANCH_AUTHOR_COLUMN_WIDTH - 1
                    ),
                    BRANCH_AUTHOR_COLUMN_WIDTH
                  )}
                </Text>
                {branch.prNumber && branch.prStatus ? (
                  <Text
                    color={
                      branch.prStatus === "open"
                        ? COLORS.GREEN
                        : branch.prStatus === "merged"
                        ? COLORS.PURPLE
                        : COLORS.DIM
                    }
                  >
                    {truncateText(
                      `#${branch.prNumber} ${branch.prStatus}`,
                      prColumnWidth
                    )}
                  </Text>
                ) : (
                  <Text color={COLORS.DIM}>—</Text>
                )}
              </Clickable>
            );
          })}
          {filteredBranches.length === 0 && (
            <Text color={COLORS.DIM}>No matching branches</Text>
          )}
        </Box>
      )}

      {checkoutError ? (
        <Box marginTop={1}>
          <Text color={COLORS.RED}>{checkoutError}</Text>
        </Box>
      ) : null}

      <SearchBar
        isSearching={isSearching}
        query={searchQuery}
        onChange={handleSearchChange}
      />
    </Box>
  );
};
