import { useEffect, useState } from "react";
import { Box, useInput } from "ink";
import { MouseProvider } from "../hooks/mouse-context.js";
import { PrPickerScreen } from "./screens/pr-picker-screen.js";
import { PlanReviewScreen } from "./screens/plan-review-screen.js";
import { CookieSyncConfirmScreen } from "./screens/cookie-sync-confirm-screen.js";
import { Spinner } from "./ui/spinner.js";
import { TestingScreen } from "./screens/testing-screen.js";
import { ResultsScreen } from "./screens/results-screen.js";
import { ThemePickerScreen } from "./screens/theme-picker-screen.js";
import { MainMenu } from "./screens/main-menu-screen.js";
import { Modeline } from "./ui/modeline.js";
import { useNavigationStore, Screen } from "../stores/use-navigation.js";
import { usePreferencesStore } from "../stores/use-preferences.js";
import { usePlanStore } from "../stores/use-plan-store.js";
import { usePlanExecutionStore } from "../stores/use-plan-execution-store.js";
import { useGitState } from "../hooks/use-git-state.js";
import { clearInkDisplay } from "../utils/clear-ink-display.js";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";

export const App = () => {
  const screen = useNavigationStore((state) => state.screen);
  const setScreen = useNavigationStore((state) => state.setScreen);
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const { data: gitState, isLoading: gitStateLoading } = useGitState();

  useEffect(() => {
    usePreferencesStore.getState().hydrateHistory();
  }, []);

  const goBack = () => {
    if (screen._tag === "ReviewPlan") {
      setScreen(Screen.Main());
      return;
    }
    if (screen._tag === "CookieSyncConfirm") {
      setScreen(Screen.ReviewPlan({ plan: screen.plan }));
      return;
    }
    if (screen._tag === "Results") {
      usePlanStore.getState().setPlan(undefined);
      usePlanStore.getState().setReadyTestPlan(undefined);
      usePlanExecutionStore.getState().setExecutedPlan(undefined);
      setScreen(Screen.Main());
      return;
    }
    if (screen._tag !== "Testing") {
      setScreen(Screen.Main());
    }
  };

  const [, setRefreshTick] = useState(0);
  const [, rows] = useStdoutDimensions();

  useInput((input, key) => {
    if (key.ctrl && input === "l") {
      clearInkDisplay();
      setRefreshTick((previous) => previous + 1);
      return;
    }
    if (key.escape && screen._tag !== "Main" && screen._tag !== "ReviewPlan") {
      goBack();
    }
    if (key.ctrl && input === "p" && screen._tag === "Main" && gitState?.isGitRepo) {
      navigateTo(Screen.SelectPr());
    }
    if (key.ctrl && input === "t") {
      navigateTo(Screen.Theme());
    }
  });

  if (gitStateLoading || !gitState) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Spinner message="Checking git state..." />
      </Box>
    );
  }

  const renderScreen = () => {
    switch (screen._tag) {
      case "Testing":
        return <TestingScreen changesFor={screen.changesFor} instruction={screen.instruction} />;
      case "Results":
        return <ResultsScreen report={screen.report} />;
      case "Theme":
        return <ThemePickerScreen />;
      case "SelectPr":
        return <PrPickerScreen />;
      case "ReviewPlan":
        return <PlanReviewScreen plan={screen.plan} />;
      case "CookieSyncConfirm":
        return <CookieSyncConfirmScreen plan={screen.plan} />;
      default:
        return <MainMenu gitState={gitState} />;
    }
  };

  return (
    <MouseProvider>
      <Box flexDirection="column" width="100%" height={rows}>
        <Box flexGrow={1}>{renderScreen()}</Box>
        <Modeline />
      </Box>
    </MouseProvider>
  );
};
