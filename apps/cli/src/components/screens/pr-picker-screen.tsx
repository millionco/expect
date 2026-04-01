import { useState } from "react";
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
import { RuledBox } from "../ui/ruled-box";
import { SearchBar } from "../ui/search-bar";
import { BRANCH_FILTERS, RemoteBranch, type BranchFilter } from "@expect/shared/models";
import { useRemoteBranches } from "../../hooks/use-remote-branches";
import { Spinner } from "../ui/spinner";
import cliTruncate from "cli-truncate";
import { visualPadEnd } from "../../utils/visual-pad-end";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import { checkoutBranch } from "@expect/supervisor";
import { queryClient } from "../../query-client";
import { ScreenHeading } from "../ui/screen-heading";

export const PrPickerScreen = () => {
  const [columns] = useStdoutDimensions();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const COLORS = useColors();
  const [confirmBranch, setConfirmBranch] = useState<RemoteBranch | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<BranchFilter>("recent");
  const [isSearching, setIsSearching] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | undefined>(undefined);
  const { data: remoteBranches = [], isLoading } = useRemoteBranches();

  const filteredBranches = RemoteBranch.filterBranches(remoteBranches, activeFilter, searchQuery);

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

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  };

  const doSwitchBranch = (branchName: string) => {
    const success = checkoutBranch(process.cwd(), branchName);
    if (success) {
      setCheckoutError(undefined);
      void queryClient.invalidateQueries({ queryKey: ["git-state"] });
      setScreen(Screen.Main());
    } else {
      setCheckoutError(
        `Could not checkout "${branchName}". You may have uncommitted changes or the branch may not exist locally.`,
      );
    }
  };

  const cycleFilter = (direction: 1 | -1) => {
    const currentIndex = BRANCH_FILTERS.indexOf(activeFilter);
    const nextIndex = (currentIndex + direction + BRANCH_FILTERS.length) % BRANCH_FILTERS.length;
    setActiveFilter(BRANCH_FILTERS[nextIndex]);
    setHighlightedIndex(0);
  };

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
        setCheckoutError(undefined);
        doSwitchBranch(selected.name);
      }
    }

    if (input === "/") {
      setIsSearching(true);
    }
  });

  useInput(
    (input, key) => {
      if (!confirmBranch) return;
      if (input.toLowerCase() === "y") {
        setCheckoutError(undefined);
        doSwitchBranch(confirmBranch.name);
        setConfirmBranch(null);
      }
      if (input.toLowerCase() === "n" || key.escape) {
        setConfirmBranch(null);
      }
    },
    { isActive: confirmBranch !== null },
  );

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading
          title="Select a PR or branch to test"
          subtitle={`${filteredBranches.length} branches`}
        />
      </Box>

      <Box marginTop={1} paddingX={1}>
        {BRANCH_FILTERS.map((filter, index) => {
          const isActive = filter === activeFilter;
          const separator = index < BRANCH_FILTERS.length - 1 ? " · " : "";
          const filterColors: Record<BranchFilter, string> = {
            recent: COLORS.CYAN,
            all: COLORS.TEXT,
            open: COLORS.GREEN,
            draft: COLORS.DIM,
            merged: COLORS.PURPLE,
            "no-pr": COLORS.YELLOW,
          };
          return (
            <Box key={filter}>
              <Text color={isActive ? filterColors[filter] : COLORS.DIM}>
                {isActive ? `[${filter}]` : filter}
              </Text>
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
              <Box key={branch.name}>
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
                {branch.prNumber && branch.prStatus && (
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
                )}
                {!(branch.prNumber && branch.prStatus) && <Text color={COLORS.DIM}>—</Text>}
              </Box>
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

      {confirmBranch ? (
        <RuledBox color={COLORS.YELLOW} marginTop={1}>
          <Text color={COLORS.YELLOW} bold>
            Switch to {confirmBranch.name}?
          </Text>
          <Text color={COLORS.DIM}>
            Press <Text color={COLORS.PRIMARY}>y</Text> to continue or{" "}
            <Text color={COLORS.PRIMARY}>n</Text> to cancel.
          </Text>
        </RuledBox>
      ) : null}

      <Box paddingX={1}>
        <SearchBar isSearching={isSearching} query={searchQuery} onChange={handleSearchChange} />
      </Box>
    </Box>
  );
};
