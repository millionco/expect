import { Cause, Effect, Fiber, Option } from "effect";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
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
import { Agent } from "@browser-tester/agent";
import { ChangesFor, Git, Planner, TestPlanDraft } from "@browser-tester/supervisor";
import { useNavigationStore } from "../stores/use-navigation.js";
import { usePreferencesStore } from "../stores/use-preferences.js";
import { useFlowSessionStore } from "../stores/use-flow-session.js";
import { useGitState } from "../hooks/use-git-state.js";
import { queryClient } from "../query-client.js";
import { clearInkDisplay } from "../utils/clear-ink-display.js";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions.js";

const usePlanningEffect = () => {
  const screen = useNavigationStore((state) => state.screen);
  const { data: gitState } = useGitState();
  const changesFor = useFlowSessionStore((state) => state.changesFor);
  const flowInstruction = useFlowSessionStore((state) => state.flowInstruction);
  const selectedCommit = useFlowSessionStore((state) => state.selectedCommit);
  const environmentOverrides = usePreferencesStore((state) => state.environmentOverrides);
  const planningProvider = usePreferencesStore((state) => state.planningProvider);
  const completePlanning = useFlowSessionStore((state) => state.completePlanning);
  const failPlanning = useFlowSessionStore((state) => state.failPlanning);

  useEffect(() => {
    if (screen !== "planning" || !gitState || !changesFor || !flowInstruction.trim()) return;

    const environment = {
      baseUrl: environmentOverrides?.baseUrl,
      headed: environmentOverrides?.headed,
      cookies: environmentOverrides?.cookies,
    };

    useFlowSessionStore.setState({
      resolvedPlanningProvider: null,
    });

    const agentBackend: "claude" | "codex" = planningProvider === "claude" ? "claude" : "codex";

    const planningFiber = Effect.runFork(
      Effect.gen(function* () {
        const git = yield* Git;
        const currentBranch = yield* git.getCurrentBranch;
        const mainBranch = yield* git.getMainBranch;

        const resolvedChangesFor = (() => {
          if (changesFor._tag === "Commit" && selectedCommit) {
            return ChangesFor.Commit({ hash: selectedCommit.hash });
          }
          if (changesFor._tag === "Branch") {
            return ChangesFor.Branch({ mainBranch });
          }
          if (changesFor._tag === "Changes") {
            return ChangesFor.Changes({ mainBranch });
          }
          return ChangesFor.WorkingTree();
        })();

        const fileStats = yield* git.getFileStats(resolvedChangesFor);
        const diffPreview = yield* git.getDiffPreview(resolvedChangesFor);

        yield* Effect.sync(() =>
          useFlowSessionStore.setState({
            resolvedPlanningProvider: planningProvider ?? null,
          }),
        );

        const schemaChangesFor =
          resolvedChangesFor._tag === "WorkingTree"
            ? { _tag: "WorkingTree" as const }
            : resolvedChangesFor._tag === "Branch"
              ? {
                  _tag: "Branch" as const,
                  branchName: currentBranch,
                  base: mainBranch,
                }
              : resolvedChangesFor._tag === "Changes"
                ? {
                    _tag: "Branch" as const,
                    branchName: currentBranch,
                    base: mainBranch,
                  }
                : { _tag: "Commit" as const, hash: resolvedChangesFor.hash };

        const draft = new TestPlanDraft({
          changesFor: schemaChangesFor,
          currentBranch,
          diffPreview,
          fileStats: [...fileStats],
          instruction: flowInstruction,
          baseUrl: environmentOverrides?.baseUrl
            ? Option.some(environmentOverrides.baseUrl)
            : Option.none(),
          isHeadless: environmentOverrides?.headed === false,
          requiresCookies: environmentOverrides?.cookies === true,
        });

        const plan = yield* Planner.use((planner) => planner.plan(draft)).pipe(
          Effect.provide(Planner.layer),
          Effect.provide(Agent.layerFor(agentBackend)),
        );

        yield* Effect.sync(() => completePlanning({ plan, environment }));
      }).pipe(
        Effect.provide(Git.withRepoRoot(process.cwd())),
        Effect.catchCause((cause) => Effect.sync(() => failPlanning(Cause.pretty(cause)))),
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
    planningProvider,
    screen,
    selectedCommit,
    changesFor,
  ]);
};

const useAutoSaveEffect = () => {
  const screen = useNavigationStore((state) => state.screen);
  const autoSaveStatus = useFlowSessionStore((state) => state.autoSaveStatus);
  const planOrigin = useFlowSessionStore((state) => state.planOrigin);

  useEffect(() => {
    if (screen !== "testing" || autoSaveStatus !== "idle" || planOrigin !== "generated") {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["saved-flows"] });
  }, [autoSaveStatus, planOrigin, screen]);
};

export const App = () => {
  const screen = useNavigationStore((state) => state.screen);
  const { data: gitState, isLoading: gitStateLoading } = useGitState();
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
