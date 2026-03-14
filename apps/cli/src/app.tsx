import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useColors } from "./theme-context.js";
import { BranchSwitcherScreen } from "./branch-switcher-screen.js";
import { CommitPickerScreen } from "./commit-picker-screen.js";
import { FlowInputScreen } from "./flow-input-screen.js";
import { PlanningScreen } from "./planning-screen.js";
import { PlanReviewScreen } from "./plan-review-screen.js";
import { Spinner } from "./spinner.js";
import { TestingScreen } from "./testing-screen.js";
import { ThemePickerScreen } from "./theme-picker-screen.js";
import { MainMenu } from "./main-menu.js";
import { generateBrowserPlan } from "./utils/browser-agent.js";
import { useAppStore } from "./store.js";

const usePlanningEffect = () => {
  const screen = useAppStore((state) => state.screen);
  const gitState = useAppStore((state) => state.gitState);
  const testAction = useAppStore((state) => state.testAction);
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const selectedCommit = useAppStore((state) => state.selectedCommit);
  const completePlanning = useAppStore((state) => state.completePlanning);
  const failPlanning = useAppStore((state) => state.failPlanning);

  useEffect(() => {
    if (screen !== "planning" || !gitState || !testAction || !flowInstruction.trim()) return;

    let isCancelled = false;

    void generateBrowserPlan({
      action: testAction,
      commit: selectedCommit ?? undefined,
      userInstruction: flowInstruction,
    })
      .then((result) => {
        if (!isCancelled) completePlanning(result);
      })
      .catch((caughtError) => {
        if (!isCancelled) {
          failPlanning(caughtError instanceof Error ? caughtError.message : "Unknown error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    completePlanning,
    failPlanning,
    flowInstruction,
    gitState,
    screen,
    selectedCommit,
    testAction,
  ]);
};

export const App = () => {
  const screen = useAppStore((state) => state.screen);
  const gitState = useAppStore((state) => state.gitState);
  const loadGitState = useAppStore((state) => state.loadGitState);
  const goBack = useAppStore((state) => state.goBack);
  const planningError = useAppStore((state) => state.planningError);
  const COLORS = useColors();

  useEffect(() => {
    loadGitState();
  }, [loadGitState]);

  usePlanningEffect();

  useInput((_input, key) => {
    if (key.escape && screen !== "main") {
      goBack();
    }
  });

  if (!gitState) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Spinner message="Checking git state..." />
      </Box>
    );
  }

  switch (screen) {
    case "testing":
      return <TestingScreen />;
    case "select-commit":
      return <CommitPickerScreen />;
    case "theme":
      return <ThemePickerScreen />;
    case "switch-branch":
      return <BranchSwitcherScreen />;
    case "flow-input":
      return <FlowInputScreen />;
    case "planning":
      return (
        <Box flexDirection="column" width="100%">
          <PlanningScreen />
          {planningError ? (
            <Box paddingX={2}>
              <Text color={COLORS.RED}>Planning failed: {planningError}</Text>
            </Box>
          ) : null}
        </Box>
      );
    case "review-plan":
      return <PlanReviewScreen />;
    default:
      return <MainMenu />;
  }
};
