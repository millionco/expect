import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useColors, useThemeContext } from "./theme-context.js";
import { MenuItem } from "./menu-item.js";
import {
  getRecommendedScope,
  type DiffStats,
  type GitState,
  type TestScope,
} from "./utils/get-git-state.js";
import {
  FRAME_CONTENT_PADDING,
  FRAME_TITLE_DECORATION_WIDTH,
  MENU_ITEM_PREFIX_WIDTH,
  STATUSBAR_BRANCH_PADDING,
  STATUSBAR_TRAILING_PADDING,
} from "./constants.js";
import { useAppStore } from "./store.js";

type MenuAction = "test-unstaged" | "test-branch" | "select-commit" | "select-branch";

interface ScopeMenuOption {
  label: string;
  detail: string;
  action: MenuAction;
  diffStats?: DiffStats | null;
}

const buildMenuOptions = (scope: TestScope, gitState: GitState): ScopeMenuOption[] => {
  switch (scope) {
    case "unstaged-changes": {
      const options: ScopeMenuOption[] = [
        {
          label: "Test unstaged changes",
          detail: "",
          action: "test-unstaged",
          diffStats: gitState.diffStats,
        },
      ];
      if (gitState.isOnMain) {
        options.push({ label: "Select a commit to test", detail: "", action: "select-commit" });
      } else if (gitState.hasBranchCommits) {
        options.push({
          label: "Test entire branch",
          detail: `(${gitState.currentBranch})`,
          action: "test-branch",
        });
      }
      return options;
    }
    case "select-commit":
      return [{ label: "Select a commit to test", detail: "", action: "select-commit" }];
    case "select-branch":
      return [{ label: "Select a branch to test", detail: "", action: "select-branch" }];
    case "entire-branch":
      return [
        {
          label: "Test entire branch",
          detail: `(${gitState.currentBranch})`,
          action: "test-branch",
        },
        { label: "Select a commit to test", detail: "", action: "select-commit" },
      ];
  }
};

export const MainMenu = () => {
  const { stdout } = useStdout();
  const COLORS = useColors();
  const { theme } = useThemeContext();
  const gitState = useAppStore((state) => state.gitState);
  const autoRunAfterPlanning = useAppStore((state) => state.autoRunAfterPlanning);
  const selectAction = useAppStore((state) => state.selectAction);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const toggleAutoRun = useAppStore((state) => state.toggleAutoRun);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!gitState) return null;

  const recommendedScope = getRecommendedScope(gitState);
  const menuOptions = buildMenuOptions(recommendedScope, gitState);

  useInput((input, key) => {
    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(menuOptions.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (key.tab) {
      toggleAutoRun();
    }

    if (input === "b") {
      navigateTo("switch-branch");
    }

    if (input === "t") {
      navigateTo("theme");
    }

    if (key.return && menuOptions.length > 0) {
      const selected = menuOptions[selectedIndex];
      if (selected.action === "select-commit") {
        navigateTo("select-commit");
      } else if (selected.action === "select-branch") {
        navigateTo("switch-branch");
      } else if (selected.action === "test-unstaged" || selected.action === "test-branch") {
        selectAction(selected.action);
      }
    }
  });

  const getMenuItemMaxWidth = (option: ScopeMenuOption, index: number): number => {
    let width = MENU_ITEM_PREFIX_WIDTH;
    width += option.label.length;
    if (option.diffStats) {
      width += ` +${option.diffStats.additions} -${option.diffStats.deletions}`.length;
    } else if (option.detail) {
      width += ` ${option.detail}`.length;
    }
    if (index === 0 && menuOptions.length > 1) {
      width += " (recommended)".length;
    }
    if (menuOptions.length === 1) {
      width += " (press return)".length;
    }
    return width;
  };

  const getMenuItemRenderedWidth = (option: ScopeMenuOption, index: number): number => {
    const isSelected = index === selectedIndex;
    let width = MENU_ITEM_PREFIX_WIDTH;
    width += option.label.length;
    if (isSelected && option.diffStats) {
      width += ` +${option.diffStats.additions} -${option.diffStats.deletions}`.length;
    } else if (option.detail) {
      width += ` ${option.detail}`.length;
    }
    if (isSelected && index === 0 && menuOptions.length > 1) {
      width += " (recommended)".length;
    }
    if (menuOptions.length === 1 && isSelected) {
      width += " (press return)".length;
    }
    return width;
  };

  const dots = "● ● ●";
  const titleLabel = "browser-tester";
  const actionsLine = " Actions";
  const optionsLine = " Options";
  const autoRunLine = `  auto-run after planning (⇥ tab): ${autoRunAfterPlanning ? "yes" : "no"}`;

  const inner =
    Math.max(
      titleLabel.length + FRAME_TITLE_DECORATION_WIDTH,
      actionsLine.length,
      optionsLine.length,
      autoRunLine.length,
      dots.length + 1,
      ...menuOptions.map((option, index) => getMenuItemMaxWidth(option, index)),
    ) + FRAME_CONTENT_PADDING;
  const pad = (content: string) => " ".repeat(Math.max(0, inner - content.length));
  const emptyRow = (
    <Text color={COLORS.DIM}>
      {"│"}
      {" ".repeat(inner)}
      {"│"}
    </Text>
  );

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Text color={COLORS.DIM}>
        {"╭"}
        {"─".repeat(Math.floor((inner - titleLabel.length - FRAME_TITLE_DECORATION_WIDTH) / 2))}
        {"·"}{" "}
        <Text bold color={COLORS.TEXT || undefined}>
          {titleLabel}
        </Text>
        <Text color={COLORS.DIM}>
          {" "}
          {"·"}
          {"─".repeat(Math.ceil((inner - titleLabel.length - FRAME_TITLE_DECORATION_WIDTH) / 2))}
        </Text>
        {"╮"}
      </Text>
      <Text color={COLORS.DIM}>
        {"│ "}
        <Text color="#ff5f57">{"● "}</Text>
        <Text color="#febc2e">{"● "}</Text>
        <Text color="#28c840">{"●"}</Text>
        {" ".repeat(inner - dots.length - 1)}
        {"│"}
      </Text>
      {emptyRow}
      <Text color={COLORS.DIM}>
        {"│ "}
        <Text bold color={COLORS.TEXT || undefined}>
          Actions
        </Text>
        {pad(" Actions")}
        {"│"}
      </Text>
      {menuOptions.map((option, index) => {
        const itemWidth = getMenuItemRenderedWidth(option, index);
        return (
          <Box key={option.label}>
            <Text color={COLORS.DIM}>{"│"}</Text>
            <MenuItem
              label={option.label}
              detail={option.detail}
              isSelected={index === selectedIndex}
              recommended={index === 0 && menuOptions.length > 1}
              hint={
                menuOptions.length === 1 && index === selectedIndex ? "press return" : undefined
              }
              diffStats={option.diffStats}
            />
            <Text color={COLORS.DIM}>
              {" ".repeat(Math.max(0, inner - itemWidth))}
              {"│"}
            </Text>
          </Box>
        );
      })}
      {emptyRow}
      {emptyRow}
      <Text color={COLORS.DIM}>
        {"│ "}
        <Text bold color={COLORS.TEXT || undefined}>
          Options
        </Text>
        {pad(optionsLine)}
        {"│"}
      </Text>
      <Text color={COLORS.DIM}>
        {"│  "}
        <Text color={COLORS.DIM}>
          auto-run after planning (<Text color={COLORS.TEXT || undefined}>⇥ tab</Text>):{" "}
          <Text color={autoRunAfterPlanning ? COLORS.ORANGE : COLORS.DIM}>
            {autoRunAfterPlanning ? "yes" : "no"}
          </Text>
        </Text>
        {pad(autoRunLine)}
        {"│"}
      </Text>
      {emptyRow}
      <Text color={COLORS.DIM}>
        {"╰"}
        {"─".repeat(inner)}
        {"╯"}
      </Text>

      <Box marginTop={1}>
        <Text backgroundColor={theme.primary} color="#000000" bold>
          {" "}
          {gitState.currentBranch}{" "}
        </Text>
        <Text backgroundColor={theme.border} color={theme.text}>
          {` t theme · b branch · ↑↓ nav`.padEnd(
            stdout.columns -
              STATUSBAR_BRANCH_PADDING -
              gitState.currentBranch.length -
              STATUSBAR_TRAILING_PADDING,
          )}
        </Text>
      </Box>
    </Box>
  );
};
