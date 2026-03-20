import { useCallback, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import figures from "figures";
import {
  BRANCH_NAME_COLUMN_WIDTH,
  BRANCH_AUTHOR_COLUMN_WIDTH,
  BRANCH_VISIBLE_COUNT,
  COMMIT_SELECTOR_WIDTH,
  TABLE_COLUMN_GAP,
} from "../../constants";
import { useColors } from "../theme-context";
import { stripMouseSequences } from "../../hooks/mouse-context";
import { Clickable } from "../ui/clickable";
import { SearchBar } from "../ui/search-bar";
import { fetchRemoteBranches, type RemoteBranch } from "@browser-tester/supervisor";
import { Spinner } from "../ui/spinner";
import cliTruncate from "cli-truncate";
import { visualPadEnd } from "../../utils/visual-pad-end";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { useFlowSessionStore } from "../../stores/use-flow-session";
import { ScreenHeading } from "../ui/screen-heading";

type PrFilter = "recent" | "all" | "open" | "draft" | "merged" | "no-pr";

const PR_FILTERS: PrFilter[] = ["recent", "all", "open", "draft", "merged", "no-pr"];

export const PrPickerScreen = () => {
  const [columns] = useStdoutDimensions();
  const storeSwitchBranch = useFlowSessionStore((state) => state.switchBranch);
  const checkoutError = useFlowSessionStore((state) => state.checkoutError);
  const clearCheckoutError = useFlowSessionStore((state) => state.clearCheckoutError);
  const COLORS = useColors();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PrFilter>("recent");
  const [isSearching, setIsSearching] = useState(false);

  const [remoteBranches, setRemoteBranches] = useState<RemoteBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStartedRef = useRef(false);
  if (!fetchStartedRef.current) {
    fetchStartedRef.current = true;
    fetchRemoteBranches(process.cwd())
      .then((branches) => setRemoteBranches(branches))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  const filteredBranches = (() => {
    let result = remoteBranches.filter((branch) => {
      if (activeFilter === "recent" || activeFilter === "all") return true;
      if (activeFilter === "no-pr") return branch.prStatus === null;
      return branch.prStatus === activeFilter;
    });
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      result = result.filter((branch) => branch.name.toLowerCase().includes(lowercaseQuery));
    }
    if (activeFilter === "recent") {
      result = result
        .filter((branch) => branch.updatedAt !== null)
        .toSorted((first, second) => {
          if (first.prStatus === "merged" !== (second.prStatus === "merged")) {
            return first.prStatus === "merged" ? 1 : -1;
          }
          return new Date(second.updatedAt ?? 0).getTime() - new Date(first.updatedAt ?? 0).getTime();
        });
    }
    return result;
  })();

  const { highlightedIndex, setHighlightedIndex, scrollOffset, handleNavigation } =
    useScrollableList({
      itemCount: filteredBranches.length,
      visibleCount: BRANCH_VISIBLE_COUNT,
    });

  const prColumnWidth =
    columns -
    COMMIT_SELECTOR_WIDTH -
    BRANCH_NAME_COLUMN_WIDTH -
    BRANCH_AUTHOR_COLUMN_WIDTH -
    TABLE_COLUMN_GAP;

  const visibleItems = filteredBranches.slice(scrollOffset, scrollOffset + BRANCH_VISIBLE_COUNT);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(stripMouseSequences(value));
      setHighlightedIndex(0);
    },
    [setHighlightedIndex],
  );

  const cycleFilter = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = PR_FILTERS.indexOf(activeFilter);
      const nextIndex = (currentIndex + direction + PR_FILTERS.length) % PR_FILTERS.length;
      setActiveFilter(PR_FILTERS[nextIndex]);
      setHighlightedIndex(0);
    },
    [activeFilter, setHighlightedIndex],
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
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading
          title="Select a PR or branch to test"
          subtitle={`${filteredBranches.length} branches`}
        />
      </Box>

      <Box marginTop={1} paddingX={1}>
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
        <Box marginTop={1} paddingX={1}>
          <Spinner message="Fetching PRs..." />
        </Box>
      ) : (
        <Box
          marginTop={1}
          flexDirection="column"
          height={BRANCH_VISIBLE_COUNT}
          overflow="hidden"
          paddingX={1}
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
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM} bold={isSelected}>
                  {visualPadEnd(
                    cliTruncate(branch.name, BRANCH_NAME_COLUMN_WIDTH - 1),
                    BRANCH_NAME_COLUMN_WIDTH,
                  )}
                </Text>
                <Text color={COLORS.CYAN}>
                  {visualPadEnd(
                    cliTruncate(branch.author || "—", BRANCH_AUTHOR_COLUMN_WIDTH - 1),
                    BRANCH_AUTHOR_COLUMN_WIDTH,
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
                    {cliTruncate(`#${branch.prNumber} ${branch.prStatus}`, prColumnWidth)}
                  </Text>
                ) : (
                  <Text color={COLORS.DIM}>—</Text>
                )}
              </Clickable>
            );
          })}
          {filteredBranches.length === 0 && <Text color={COLORS.DIM}>No matching branches</Text>}
        </Box>
      )}

      {checkoutError ? (
        <Box marginTop={1} paddingX={1}>
          <Text color={COLORS.RED}>{checkoutError}</Text>
        </Box>
      ) : null}

      <Box paddingX={1}>
        <SearchBar isSearching={isSearching} query={searchQuery} onChange={handleSearchChange} />
      </Box>
    </Box>
  );
};
