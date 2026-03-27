import { useEffect, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { spawnSync } from "node:child_process";
import { MouseProvider } from "../hooks/mouse-context";
import { PrPickerScreen } from "./screens/pr-picker-screen";
import { CookieSyncConfirmScreen } from "./screens/cookie-sync-confirm-screen";
import { PortPickerScreen } from "./screens/port-picker-screen";
import { TestingScreen } from "./screens/testing-screen";
import { ResultsScreen } from "./screens/results-screen";
import { SavedFlowPickerScreen } from "./screens/saved-flow-picker-screen";
import { MainMenu } from "./screens/main-menu-screen";
import { WatchScreen } from "./screens/watch-screen";
import { Modeline } from "./ui/modeline";
import { useNavigationStore, Screen } from "../stores/use-navigation";
import { usePlanExecutionStore } from "../stores/use-plan-execution-store";
import { useGitState } from "../hooks/use-git-state";
import { useUpdateCheck } from "../hooks/use-update-check";
import { clearInkDisplay } from "../utils/clear-ink-display";
import { useStdoutDimensions } from "../hooks/use-stdout-dimensions";
import { ALT_SCREEN_OFF, NPM_PACKAGE_NAME } from "../constants";
import { AgentBackend } from "@expect/agent";
import { useAtomSet } from "@effect/atom-react";
import { agentProviderAtom } from "../data/runtime";
import { Option } from "effect";

export const App = ({ agent }: { agent: AgentBackend }) => {
  const screen = useNavigationStore((state) => state.screen);
  const setScreen = useNavigationStore((state) => state.setScreen);
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const { data: gitState } = useGitState();

  const setAgentProvider = useAtomSet(agentProviderAtom);
  useEffect(() => {
    setAgentProvider(Option.some(agent));
  }, [agent, setAgentProvider]);

  const goBack = () => {
    if (screen._tag === "CookieSyncConfirm") {
      setScreen(Screen.Main());
      return;
    }
    if (screen._tag === "PortPicker") {
      setScreen(Screen.Main());
      return;
    }
    if (screen._tag === "Results") {
      usePlanExecutionStore.getState().setExecutedPlan(undefined);
      setScreen(Screen.Main());
      return;
    }
    if (screen._tag !== "Testing") {
      setScreen(Screen.Main());
    }
  };

  const { updateAvailable } = useUpdateCheck();
  const { exit } = useApp();

  const [, setRefreshTick] = useState(0);
  const [, rows] = useStdoutDimensions();

  useInput((input, key) => {
    if (key.ctrl && input === "l") {
      clearInkDisplay();
      setRefreshTick((previous) => previous + 1);
      return;
    }
    if (key.ctrl && input === "u" && updateAvailable) {
      exit();
      process.stdout.write(ALT_SCREEN_OFF);
      spawnSync("npm", ["install", "-g", `${NPM_PACKAGE_NAME}@latest`], {
        stdio: "inherit",
      });
      return;
    }
    if (key.escape && screen._tag !== "Main" && screen._tag !== "Watch") {
      goBack();
    }
    if (key.ctrl && input === "p" && screen._tag === "Main" && gitState?.isGitRepo) {
      navigateTo(Screen.SelectPr());
    }
    if (key.ctrl && input === "r" && screen._tag === "Main") {
      navigateTo(Screen.SavedFlowPicker());
    }
  });

  const renderScreen = () => {
    if (!gitState) {
      return <MainMenu gitState={undefined} />;
    }

    switch (screen._tag) {
      case "PortPicker":
        return (
          <PortPickerScreen
            changesFor={screen.changesFor}
            instruction={screen.instruction}
            savedFlow={screen.savedFlow}
            requiresCookies={screen.requiresCookies}
            mode={screen.mode}
          />
        );
      case "Watch":
        return (
          <WatchScreen
            changesFor={screen.changesFor}
            instruction={screen.instruction}
            savedFlow={screen.savedFlow}
            requiresCookies={screen.requiresCookies}
            baseUrls={screen.baseUrls}
          />
        );
      case "Testing":
        return (
          <TestingScreen
            changesFor={screen.changesFor}
            instruction={screen.instruction}
            savedFlow={screen.savedFlow}
            requiresCookies={screen.requiresCookies}
            baseUrls={screen.baseUrls}
          />
        );
      case "Results":
        return (
          <ResultsScreen
            report={screen.report}
            replayUrl={screen.replayUrl}
            localReplayUrl={screen.localReplayUrl}
            videoUrl={screen.videoUrl}
          />
        );
      case "SelectPr":
        return <PrPickerScreen />;
      case "CookieSyncConfirm":
        return (
          <CookieSyncConfirmScreen
            changesFor={screen.changesFor}
            instruction={screen.instruction}
            savedFlow={screen.savedFlow}
            mode={screen.mode}
          />
        );
      case "SavedFlowPicker":
        return <SavedFlowPickerScreen />;
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
