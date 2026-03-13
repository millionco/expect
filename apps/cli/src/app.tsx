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
} from "./utils/get-git-state.js";
import { TestingScreen } from "./testing-screen.js";
import { switchBranch } from "./utils/switch-branch.js";
import type { Commit } from "./utils/fetch-commits.js";
import type { TestAction } from "./utils/mock-agent-stream.js";

type Screen = "main" | "switch-branch" | "select-commit" | "testing";

type MenuAction = "test-unstaged" | "test-branch" | "select-commit" | "select-branch";

interface ScopeMenuOption {
  label: string;
  detail: string;
  action: MenuAction;
}

const buildMenuOptions = (scope: TestScope, gitState: GitState): ScopeMenuOption[] => {
  switch (scope) {
    case "unstaged-changes": {
      const options: ScopeMenuOption[] = [
        {
          label: "Test unstaged changes",
          detail: "",
          action: "test-unstaged",
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

export const App = () => {
  const [gitState, setGitState] = useState<GitState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("main");
  const [testAction, setTestAction] = useState<TestAction | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [reviewPlan, setReviewPlan] = useState(false);

  useEffect(() => {
    const state = getGitState();
    setGitState(state);
  }, []);

  const recommendedScope = gitState ? getRecommendedScope(gitState) : null;
  const menuOptions =
    gitState && recommendedScope ? buildMenuOptions(recommendedScope, gitState) : [];
  useInput((input, key) => {
    if (!gitState || !recommendedScope) return;

    if (screen !== "main") {
      if (key.escape) {
        setScreen("main");
      }
      return;
    }

    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(menuOptions.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (key.tab) {
      setReviewPlan((previous) => !previous);
    }

    if (input === "b") {
      setScreen("switch-branch");
    }

    if (key.return && menuOptions.length > 0) {
      const selected = menuOptions[selectedIndex];
      if (selected.action === "select-commit") {
        setScreen("select-commit");
      } else if (selected.action === "select-branch") {
        setScreen("switch-branch");
      } else if (selected.action === "test-unstaged" || selected.action === "test-branch") {
        setTestAction(selected.action);
        setSelectedCommit(null);
        setScreen("testing");
      }
    }
  });

  const handleCommitSelect = (commit: Commit) => {
    setTestAction("select-commit");
    setSelectedCommit(commit);
    setScreen("testing");
  };

  const handleTestingExit = () => {
    setTestAction(null);
    setSelectedCommit(null);
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

  if (screen === "testing" && testAction) {
    return (
      <TestingScreen
        action={testAction}
        commit={selectedCommit ?? undefined}
        gitState={gitState}
        onExit={handleTestingExit}
      />
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
      <Box marginTop={1}>
        <Text color={COLORS.TEXT}>AI-powered browser testing for your changes</Text>
      </Box>

      <Box flexDirection="column" marginTop={2} gap={1}>
        {menuOptions.map((option, index) => (
          <MenuItem
            key={option.label}
            label={option.label}
            detail={option.detail}
            isSelected={index === selectedIndex}
            recommended={index === 0 && menuOptions.length > 1}
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

      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Text color={COLORS.DIM}>
          ↑/↓ navigate · <Text color={COLORS.TEXT}>[b]</Text> switch branch
          <Text color={COLORS.TEXT}> {gitState.currentBranch}</Text>
          {menuOptions[selectedIndex]?.action === "test-unstaged" && gitState.diffStats ? (
            <>
              <Text color={COLORS.DIM}> · </Text>
              <Text color={COLORS.GREEN}>+{gitState.diffStats.additions}</Text>
              <Text color={COLORS.DIM}> </Text>
              <Text color={COLORS.RED}>-{gitState.diffStats.deletions}</Text>
              <Text color={COLORS.DIM}> · {gitState.diffStats.filesChanged} files</Text>
            </>
          ) : null}
        </Text>
        <Text color={reviewPlan ? COLORS.DIM : COLORS.YELLOW}>
          {reviewPlan ? "⏵⏵" : "⏵⏵"} Automatically begin testing after planning
          <Text color={COLORS.DIM}> (tab)</Text>
        </Text>
      </Box>
    </Box>
  );
};
