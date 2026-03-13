import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { COLORS } from "./constants.js";
import { MenuItem } from "./menu-item.js";
import { BranchSwitcherScreen } from "./branch-switcher-screen.js";
import { CommitPickerScreen } from "./commit-picker-screen.js";
import { ColoredLogo } from "./colored-logo.js";
import { Spinner } from "./spinner.js";
import {
  getGitState,
  getRecommendedScope,
  type GitState,
  type TestScope,
  type DiffStats,
} from "./utils/get-git-state.js";
import { switchBranch } from "./utils/switch-branch.js";
import type { Commit } from "./utils/fetch-commits.js";

type Screen = "main" | "switch-branch" | "select-commit";

type MenuAction = "test-unstaged" | "test-branch" | "select-commit" | "select-branch";

interface ScopeMenuOption {
  label: string;
  detail: string;
  action: MenuAction;
  diffStats?: DiffStats;
}

const buildMenuOptions = (scope: TestScope, gitState: GitState): ScopeMenuOption[] => {
  switch (scope) {
    case "unstaged-changes": {
      const options: ScopeMenuOption[] = [
        {
          label: "Test unstaged changes",
          detail: "",
          action: "test-unstaged",
          diffStats: gitState.diffStats ?? undefined,
        },
      ];
      if (gitState.isOnMain) {
        options.push({ label: "Select a commit to test", detail: "", action: "select-commit" });
      } else if (gitState.hasBranchCommits) {
        options.push({
          label: "Test entire branch",
          detail: `(${gitState.currentBranch})`,
          action: "test-branch",
          diffStats: gitState.branchDiffStats ?? undefined,
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
          diffStats: gitState.branchDiffStats ?? undefined,
        },
        { label: "Select a commit to test", detail: "", action: "select-commit" },
      ];
  }
};

export const App = () => {
  const [gitState, setGitState] = useState<GitState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("main");

  useEffect(() => {
    const state = getGitState();
    setGitState(state);
  }, []);

  const recommendedScope = gitState ? getRecommendedScope(gitState) : null;
  const menuOptions =
    gitState && recommendedScope ? buildMenuOptions(recommendedScope, gitState) : [];
  const showSwitchBranch = Boolean(recommendedScope);

  useInput((input, key) => {
    if (!gitState || !recommendedScope) return;

    if (screen !== "main") {
      if (key.escape) {
        setScreen("main");
      }
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((previous) => Math.min(menuOptions.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (input === "b" && showSwitchBranch) {
      setScreen("switch-branch");
    }

    if (key.return && menuOptions.length > 0) {
      const selected = menuOptions[selectedIndex];
      if (selected.action === "select-commit") {
        setScreen("select-commit");
      }
      if (selected.action === "select-branch") {
        setScreen("switch-branch");
      }
    }
  });

  const handleCommitSelect = (_commit: Commit) => {
    setScreen("main");
  };

  const handleBranchSwitch = (branch: string) => {
    const success = switchBranch(branch);
    if (success) {
      const newState = getGitState();
      setGitState(newState);
      setSelectedIndex(0);
    }
    setScreen("main");
  };

  if (!gitState) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Spinner message="Checking git state..." />
      </Box>
    );
  }

  if (screen === "select-commit") {
    return <CommitPickerScreen onSelect={handleCommitSelect} />;
  }

  if (screen === "switch-branch") {
    return <BranchSwitcherScreen onSelect={handleBranchSwitch} />;
  }

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
      <ColoredLogo />

      <Box marginTop={2}>
        <Text color={COLORS.DIM}>
          <Text color={COLORS.TEXT}>{gitState.currentBranch}</Text>
          {gitState.hasUnstagedChanges && gitState.diffStats
            ? ` · ${gitState.diffStats.filesChanged} files changed`
            : " · no changes"}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={2} gap={1}>
        {menuOptions.map((option, index) => (
          <MenuItem
            key={option.label}
            label={option.label}
            detail={option.detail}
            isSelected={index === selectedIndex}
            recommended={index === 0 && menuOptions.length > 1}
            diffStats={option.diffStats}
          />
        ))}
      </Box>

      <Box
        marginTop={2}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={COLORS.DIVIDER}
      />

      <Text color={COLORS.DIM}>
        {showSwitchBranch
          ? "↑/↓ to navigate · Enter to select · [b] switch branch"
          : "Enter to select"}
      </Text>
    </Box>
  );
};
