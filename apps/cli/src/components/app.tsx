import { Effect, Fiber } from "effect";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { MouseProvider } from "../hooks/mouse-context";
import { useColors } from "./theme-context";
import { PrPickerScreen } from "./screens/pr-picker-screen";
import { PlanningScreen } from "./screens/planning-screen";
import { PlanReviewScreen } from "./screens/plan-review-screen";
import { CookieSyncConfirmScreen } from "./screens/cookie-sync-confirm-screen";
import { SavedFlowPickerScreen } from "./screens/saved-flow-picker-screen";
import { Spinner } from "./ui/spinner";
import { TestingScreen } from "./screens/testing-screen";
import { ResultsScreen } from "./screens/results-screen";
import { ThemePickerScreen } from "./screens/theme-picker-screen";
import { MainMenu } from "./screens/main-menu-screen";
import { Modeline } from "./ui/modeline";
import {
  getBrowserEnvironment,
  planBrowserFlow,
  resolveBrowserTarget,
  resolveAgentProvider,
  saveFlow,
} from "@browser-tester/supervisor";
import { useNavigationStore } from "../stores/use-navigation";
import { usePreferencesStore } from "../stores/use-preferences";
import { useFlowSessionStore } from "../stores/use-flow-session";
import { useGitState } from "../hooks/use-git-state";
import { EMPTY_SAVED_FLOWS, useSavedFlows } from "../hooks/use-saved-flows";
import { queryClient } from "../query-client";
import { CliRuntime } from "../runtime";
import { clearInkDisplay } from "../utils/clear-ink-display";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions";

const usePlanningEffect = () => {
  const screen = useNavigationStore((state) => state.screen);
  const { data: gitState } = useGitState();
  const testAction = useFlowSessionStore((state) => state.testAction);
  const flowInstruction = useFlowSessionStore((state) => state.flowInstruction);
  const selectedCommit = useFlowSessionStore((state) => state.selectedCommit);
  const environmentOverrides = usePreferencesStore((state) => state.environmentOverrides);
  const planningProvider = usePreferencesStore((state) => state.planningProvider);
  const planningModel = usePreferencesStore((state) => state.planningModel);
  const completePlanning = useFlowSessionStore((state) => state.completePlanning);
  const failPlanning = useFlowSessionStore((state) => state.failPlanning);

  useEffect(() => {
    if (screen !== "planning" || !gitState || !testAction || !flowInstruction.trim()) return;

    const target = resolveBrowserTarget({
      action: testAction,
      commit: selectedCommit ?? undefined,
    });
    const environment = getBrowserEnvironment(environmentOverrides);
    useFlowSessionStore.setState({ resolvedTarget: target, resolvedPlanningProvider: null });

    const planningFiber = Effect.runFork(
      resolveAgentProvider(planningProvider).pipe(
        Effect.tap((resolvedAgentProvider) =>
          Effect.sync(() =>
            useFlowSessionStore.setState({
              resolvedPlanningProvider: resolvedAgentProvider.provider,
            }),
          ),
        ),
        Effect.flatMap(() =>
          planBrowserFlow({
            target,
            userInstruction: flowInstruction,
            environment,
            provider: planningProvider,
            ...(planningModel ? { providerSettings: { model: planningModel } } : {}),
          }),
        ),
        Effect.tap((plan) => Effect.sync(() => completePlanning({ target, plan, environment }))),
        Effect.catchTags({
          PlanningError: (planningError) => Effect.sync(() => failPlanning(planningError.message)),
        }),
      ),
    );

    return () => {
      void Effect.runFork(Fiber.interrupt(planningFiber));
    };
  }, [
    completePlanning,
    environmentOverrides,
    failPlanning,
    flowInstruction,
    gitState,
    planningModel,
    planningProvider,
    screen,
    selectedCommit,
    testAction,
  ]);
};

const useAutoSaveEffect = () => {
  const screen = useNavigationStore((state) => state.screen);
  const autoSaveFlows = usePreferencesStore((state) => state.autoSaveFlows);
  const autoSaveStatus = useFlowSessionStore((state) => state.autoSaveStatus);
  const planOrigin = useFlowSessionStore((state) => state.planOrigin);
  const resolvedTarget = useFlowSessionStore((state) => state.resolvedTarget);
  const generatedPlan = useFlowSessionStore((state) => state.generatedPlan);
  const browserEnvironment = useFlowSessionStore((state) => state.browserEnvironment);

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

    useFlowSessionStore.setState({ autoSaveStatus: "saving" });

    const saveFiber = CliRuntime.runFork(
      saveFlow({
        target: resolvedTarget,
        plan: generatedPlan,
        environment: browserEnvironment,
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            useFlowSessionStore.setState({ autoSaveStatus: "saved" });
            void queryClient.invalidateQueries({ queryKey: ["saved-flows"] });
          }),
        ),
        Effect.catchTags({
          FlowStorageError: () =>
            Effect.sync(() => useFlowSessionStore.setState({ autoSaveStatus: "error" })),
        }),
      ),
    );

    return () => {
      void Effect.runFork(Fiber.interrupt(saveFiber));
    };
  }, [
    autoSaveFlows,
    autoSaveStatus,
    browserEnvironment,
    generatedPlan,
    planOrigin,
    resolvedTarget,
    screen,
  ]);
};

export const App = () => {
  const screen = useNavigationStore((state) => state.screen);
  const { data: gitState, isLoading: gitStateLoading } = useGitState();
  const { data: savedFlowSummaries = EMPTY_SAVED_FLOWS } = useSavedFlows();
  const goBack = useFlowSessionStore((state) => state.goBack);
  const planningError = useFlowSessionStore((state) => state.planningError);
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const COLORS = useColors();

  usePlanningEffect();
  useAutoSaveEffect();

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
    if (key.ctrl && input === "r" && screen === "main" && savedFlowSummaries.length > 0) {
      navigateTo("saved-flow-picker");
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
              <Box flexDirection="column" paddingX={2}>
                <Text color={COLORS.RED}>Planning failed: {planningError}</Text>
                <Text color={COLORS.DIM}>Press esc to go back and choose a different agent.</Text>
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
