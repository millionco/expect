import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { MouseProvider } from "../hooks/mouse-context.js";
import { useColors } from "./theme-context.js";
import { PrPickerScreen } from "./screens/pr-picker-screen.js";
import { PlanningScreen } from "./screens/planning-screen.js";
import { PlanReviewScreen } from "./screens/plan-review-screen.js";
import { CookieSyncConfirmScreen } from "./screens/cookie-sync-confirm-screen.js";
import { SavedFlowPickerScreen } from "./screens/saved-flow-picker-screen.js";
import { Spinner } from "./ui/spinner.js";
import { TestingScreen } from "./screens/testing-screen.js";
import { ResultsScreen } from "./screens/results-screen.js";
import { ThemePickerScreen } from "./screens/theme-picker-screen.js";
import { MainMenu } from "./screens/main-menu-screen.js";
import { Modeline } from "./ui/modeline.js";
import { InkGrab } from "../../ink-grab/index.js";
import {
  resolveBrowserTarget,
  getBrowserEnvironment,
} from "../utils/browser-agent.js";
import { planBrowserFlow } from "@browser-tester/supervisor";
import { useAppStore } from "../store.js";
import { saveFlow } from "../utils/save-flow.js";

const usePlanningEffect = () => {
  const screen = useAppStore((state) => state.screen);
  const gitState = useAppStore((state) => state.gitState);
  const testAction = useAppStore((state) => state.testAction);
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const selectedCommit = useAppStore((state) => state.selectedCommit);
  const environmentOverrides = useAppStore(
    (state) => state.environmentOverrides
  );
  const completePlanning = useAppStore((state) => state.completePlanning);
  const failPlanning = useAppStore((state) => state.failPlanning);

  useEffect(() => {
    if (
      screen !== "planning" ||
      !gitState ||
      !testAction ||
      !flowInstruction.trim()
    )
      return;

    let isCancelled = false;

    const run = async () => {
      const target = resolveBrowserTarget({
        action: testAction,
        commit: selectedCommit ?? undefined,
      });
      if (isCancelled) return;

      const environment = getBrowserEnvironment(environmentOverrides);
      useAppStore.setState({ resolvedTarget: target });
      const plan = await planBrowserFlow({
        target,
        userInstruction: flowInstruction,
        environment,
      });
      if (isCancelled) return;

      completePlanning({ target, plan, environment });
    };

    void run().catch((caughtError) => {
      if (!isCancelled) {
        failPlanning(
          caughtError instanceof Error ? caughtError.message : "Unknown error"
        );
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [
    completePlanning,
    environmentOverrides,
    failPlanning,
    flowInstruction,
    gitState,
    screen,
    selectedCommit,
    testAction,
  ]);
};

const useAutoSaveEffect = () => {
  const screen = useAppStore((state) => state.screen);
  const autoSaveFlows = useAppStore((state) => state.autoSaveFlows);
  const autoSaveStatus = useAppStore((state) => state.autoSaveStatus);
  const planOrigin = useAppStore((state) => state.planOrigin);
  const resolvedTarget = useAppStore((state) => state.resolvedTarget);
  const generatedPlan = useAppStore((state) => state.generatedPlan);
  const browserEnvironment = useAppStore((state) => state.browserEnvironment);
  const loadSavedFlows = useAppStore((state) => state.loadSavedFlows);

  useEffect(() => {
    if (
      screen !== "testing" ||
      !autoSaveFlows ||
      autoSaveStatus !== "idle" ||
      planOrigin !== "generated" ||
      !resolvedTarget ||
      !generatedPlan ||
      !browserEnvironment
    ) {
      return;
    }

    let isCancelled = false;
    useAppStore.setState({ autoSaveStatus: "saving" });

    void saveFlow({
      target: resolvedTarget,
      plan: generatedPlan,
      environment: browserEnvironment,
    })
      .then(() => {
        if (!isCancelled) {
          useAppStore.setState({ autoSaveStatus: "saved" });
          void loadSavedFlows();
        }
      })
      .catch(() => {
        if (!isCancelled) {
          useAppStore.setState({ autoSaveStatus: "error" });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    autoSaveFlows,
    autoSaveStatus,
    browserEnvironment,
    generatedPlan,
    loadSavedFlows,
    planOrigin,
    resolvedTarget,
    screen,
  ]);
};

export const App = () => {
  const screen = useAppStore((state) => state.screen);
  const gitState = useAppStore((state) => state.gitState);
  const loadGitState = useAppStore((state) => state.loadGitState);
  const loadSavedFlows = useAppStore((state) => state.loadSavedFlows);
  const goBack = useAppStore((state) => state.goBack);
  const planningError = useAppStore((state) => state.planningError);
  const COLORS = useColors();

  useEffect(() => {
    loadGitState();
  }, [loadGitState]);

  useEffect(() => {
    void loadSavedFlows();
  }, [loadSavedFlows]);

  usePlanningEffect();
  useAutoSaveEffect();

  const navigateTo = useAppStore((state) => state.navigateTo);

  useInput((input, key) => {
    if (key.escape && screen !== "main" && screen !== "review-plan") {
      goBack();
    }
    if (key.ctrl && input === "p" && screen === "main") {
      navigateTo("select-pr");
    }
    if (key.ctrl && input === "t") {
      navigateTo("theme");
    }
  });

  if (!gitState) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Spinner message="Checking git state..." />
      </Box>
    );
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
      case "saved-flow-picker":
        return <SavedFlowPickerScreen />;
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
      case "cookie-sync-confirm":
        return <CookieSyncConfirmScreen />;
      default:
        return <MainMenu />;
    }
  };

  return (
    <InkGrab>
      <MouseProvider>
        <Box flexDirection="column" width="100%">
          <Box flexGrow={1}>{renderScreen()}</Box>
          <Modeline />
        </Box>
      </MouseProvider>
    </InkGrab>
  );
};
