import { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useColors } from "../theme-context.js";
import { Clickable } from "../ui/clickable.js";
import { MenuItem } from "../ui/menu-item.js";
import type { DiffStats } from "@browser-tester/supervisor";
import { type GitState } from "../../utils/get-git-state.js";
import { useAppStore } from "../../store.js";

type MenuAction = "test-branch" | "select-pr";

interface ScopeMenuOption {
  label: string;
  detail: string;
  action: MenuAction;
  diffStats?: DiffStats | null;
}

const buildMenuOptions = (gitState: GitState): ScopeMenuOption[] => {
  const options: ScopeMenuOption[] = [];

  if (!gitState.isOnMain && gitState.hasBranchCommits) {
    options.push({
      label: "Test current branch",
      detail: `(${gitState.branchCommitCount} commits)`,
      action: "test-branch",
      diffStats: gitState.branchDiffStats,
    });
  }

  options.push({
    label: "Select a PR to test",
    detail: "",
    action: "select-pr",
  });

  return options;
};

export const MainMenu = () => {
  const COLORS = useColors();
  const gitState = useAppStore((state) => state.gitState);
  const autoRunAfterPlanning = useAppStore(
    (state) => state.autoRunAfterPlanning
  );
  const savedFlowSummaries = useAppStore((state) => state.savedFlowSummaries);
  const selectAction = useAppStore((state) => state.selectAction);
  const beginSavedFlowReuse = useAppStore((state) => state.beginSavedFlowReuse);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const toggleAutoRun = useAppStore((state) => state.toggleAutoRun);
  const setMainMenuOnAction = useAppStore((state) => state.setMainMenuOnAction);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!gitState) return null;

  const menuOptions = buildMenuOptions(gitState);
  const selectedOption = menuOptions[selectedIndex] ?? null;
  const canReuseSavedFlow =
    savedFlowSummaries.length > 0 && Boolean(selectedOption);

  const activateOption = useCallback(
    (option: ScopeMenuOption) => {
      if (option.action === "select-pr") {
        navigateTo("select-pr");
      } else {
        selectAction(option.action);
      }
    },
    [navigateTo, selectAction]
  );

  const totalItems = menuOptions.length + 1;
  const autoRunIndex = menuOptions.length;

  useEffect(() => {
    setMainMenuOnAction(selectedIndex < autoRunIndex);
  }, [selectedIndex, autoRunIndex, setMainMenuOnAction]);

  useInput((input, key) => {
    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(totalItems - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (key.tab) {
      toggleAutoRun();
    }

    if (input === "r" && canReuseSavedFlow && selectedOption) {
      if (selectedOption.action === "test-branch") {
        beginSavedFlowReuse(selectedOption.action);
      }
    }

    if (key.return) {
      if (selectedIndex === autoRunIndex) {
        toggleAutoRun();
      } else if (menuOptions.length > 0) {
        activateOption(menuOptions[selectedIndex]);
      }
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={COLORS.DIM}>{"═".repeat(40)}</Text>
        <Text bold color={COLORS.PRIMARY}>
          {"  BROWSER-TESTER v0.1"}
        </Text>
        <Text color={COLORS.DIM}>{"  AI-Powered Browser Testing System"}</Text>
        <Text color={COLORS.DIM}>{"═".repeat(40)}</Text>
        <Text color={COLORS.DIM}>
          {"  BRANCH "}
          <Text color={COLORS.TEXT}>{gitState.currentBranch}</Text>
          {"  STATUS "}
          <Text color={COLORS.GREEN}>[READY]</Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        {menuOptions.map((option, index) => {
          return (
            <Clickable
              key={option.label}
              onClick={() => activateOption(option)}
            >
              <MenuItem
                label={option.label}
                detail={option.detail}
                isSelected={index === selectedIndex}
                recommended={index === 0 && menuOptions.length > 1}
                hint={
                  menuOptions.length === 1 && index === selectedIndex
                    ? "press return"
                    : undefined
                }
                diffStats={option.diffStats}
              />
            </Clickable>
          );
        })}
      </Box>

      <Box marginTop={1} marginBottom={1} flexDirection="column">
        <Clickable onClick={toggleAutoRun}>
          {selectedIndex === autoRunIndex ? (
            <Text>
              <Text color={COLORS.PRIMARY}>{"▸ "}</Text>
              <Text color={COLORS.PRIMARY} bold>
                AUTO-RUN{" "}
              </Text>
              <Text color={autoRunAfterPlanning ? COLORS.GREEN : COLORS.DIM}>
                {autoRunAfterPlanning ? "[ON]" : "[OFF]"}
              </Text>
            </Text>
          ) : (
            <Text color={COLORS.DIM}>
              {"  "}AUTO-RUN{" "}
              <Text color={autoRunAfterPlanning ? COLORS.GREEN : COLORS.DIM}>
                {autoRunAfterPlanning ? "[ON]" : "[OFF]"}
              </Text>
            </Text>
          )}
        </Clickable>
      </Box>
    </Box>
  );
};
