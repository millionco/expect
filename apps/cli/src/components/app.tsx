import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useAtomSet } from "@effect/atom-react";
import { MouseProvider } from "../hooks/mouse-context.js";
import { useColors } from "./theme-context.js";
import { PrPickerScreen } from "./screens/pr-picker-screen.js";
import { PlanningScreen } from "./screens/planning-screen.js";
import { PlanReviewScreen } from "./screens/plan-review-screen.js";
import { CookieSyncConfirmScreen } from "./screens/cookie-sync-confirm-screen.js";
import { Spinner } from "./ui/spinner.js";
import { TestingScreen } from "./screens/testing-screen.js";
import { ResultsScreen } from "./screens/results-screen.js";
import { ThemePickerScreen } from "./screens/theme-picker-screen.js";
import { MainMenu } from "./screens/main-menu-screen.js";
import { Modeline } from "./ui/modeline.js";
import { useNavigationStore } from "../stores/use-navigation.js";
import { usePreferencesStore } from "../stores/use-preferences.js";
import { usePlanStore, Plan } from "../stores/use-plan-store.js";
import { usePlanExecutionStore } from "../stores/use-plan-execution-store.js";
import { useGitState } from "../hooks/use-git-state.js";
import { clearInkDisplay } from "../utils/clear-ink-display.js";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";
import { createPlanFn } from "../data/planning-atom.js";

export const App = () => {
  const screen = useNavigationStore((state) => state.screen);
  const setScreen = useNavigationStore((state) => state.setScreen);
  const { data: gitState, isLoading: gitStateLoading } = useGitState();
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const COLORS = useColors();
  const triggerCreatePlan = useAtomSet(createPlanFn, { mode: "promise" });
  const [planningError, setPlanningError] = useState<string | undefined>(
    undefined
  );

  const handlePlanningStart = async () => {
    const plan = usePlanStore.getState().plan;
    console.error("[app] handlePlanningStart, plan._tag:", plan?._tag);
    if (plan?._tag !== "draft") return;

    console.error("[app] triggering createPlan with:", {
      changesFor: plan.changesFor._tag,
      instruction: plan.instruction.slice(0, 50),
    });

    try {
      const testPlan = await triggerCreatePlan({
        changesFor: plan.changesFor,
        flowInstruction: plan.instruction,
      });
      console.error("[app] planning succeeded:", testPlan.title);
      usePlanStore.getState().setPlan(Plan.plan(testPlan));
      const { autoRunAfterPlanning } = usePreferencesStore.getState();
      setScreen(autoRunAfterPlanning ? "testing" : "review-plan");
    } catch (error) {
      console.error("[app] planning failed:", String(error));
      setPlanningError(String(error));
    }
  };

  const goBack = () => {
    const { skipPlanning } = usePreferencesStore.getState();

    if (screen === "review-plan" || screen === "planning") {
      setPlanningError(undefined);
      setScreen("main");
      return;
    }
    if (screen === "cookie-sync-confirm") {
      setScreen(skipPlanning ? "main" : "review-plan");
      return;
    }
    if (screen === "results") {
      usePlanStore.getState().setPlan(undefined);
      usePlanExecutionStore.getState().setExecutedPlan(undefined);
      setScreen("main");
      return;
    }
    if (screen !== "testing") {
      setScreen("main");
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
    if (key.escape && screen !== "main" && screen !== "review-plan") {
      goBack();
    }
    if (key.ctrl && input === "p" && screen === "main" && gitState?.isGitRepo) {
      navigateTo("select-pr");
    }
    if (key.ctrl && input === "t") {
      navigateTo("theme");
    }
  });

  if (gitStateLoading || !gitState) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Spinner message="Checking git state..." />
      </Box>
    );
  }

  if (screen === "planning" && !planningError) {
    console.error("[app] screen=planning, triggering handlePlanningStart");
    void handlePlanningStart();
  } else if (screen === "testing") {
    console.error("[app] screen=testing, plan._tag:", usePlanStore.getState().plan?._tag);
  }

  const renderScreen = () => {
    switch (screen) {
      case "testing":
        return <TestingScreen />;
      case "results":
        return <ResultsScreen />;
      case "theme":
        return <ThemePickerScreen />;
      case "select-pr":
        return <PrPickerScreen />;
      case "planning":
        return (
          <Box flexDirection="column" width="100%">
            <PlanningScreen />
            {planningError ? (
              <Box flexDirection="column" paddingX={2}>
                <Text color={COLORS.RED}>Planning failed: {planningError}</Text>
                <Text color={COLORS.DIM}>Press esc to go back.</Text>
              </Box>
            ) : null}
          </Box>
        );
      case "review-plan":
        return <PlanReviewScreen />;
      case "cookie-sync-confirm":
        return <CookieSyncConfirmScreen />;
      default:
        return <MainMenu />;
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
