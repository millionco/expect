import { create } from "zustand";
import * as Data from "effect/Data";
import type { ChangesFor, SavedFlow, TestReport } from "@expect/shared/models";
import { containsUrl } from "../utils/detect-url";

export type ExecutionMode = "run" | "watch";

interface ScreenExecutionProps {
  readonly changesFor: ChangesFor;
  readonly instruction: string;
  readonly savedFlow?: SavedFlow;
  readonly requiresCookies?: boolean;
}

export type Screen = Data.TaggedEnum<{
  Main: {};
  SelectPr: {};
  CookieSyncConfirm: ScreenExecutionProps & { mode?: ExecutionMode };
  PortPicker: {
    mode?: ExecutionMode;
  } & ScreenExecutionProps;
  Watch: {
    baseUrls?: readonly string[];
  } & ScreenExecutionProps;
  Testing: {
    baseUrls?: readonly string[];
  } & ScreenExecutionProps;
  Results: { report: TestReport; replayUrl?: string; localReplayUrl?: string; videoUrl?: string };
  SavedFlowPicker: {};
}>;
export const Screen = Data.taggedEnum<Screen>();

const screenForModeOrPortPicker = (mode: ExecutionMode, props: ScreenExecutionProps): Screen =>
  containsUrl(props.instruction)
    ? mode === "watch"
      ? Screen.Watch(props)
      : Screen.Testing(props)
    : Screen.PortPicker({ ...props, mode });

export const screenForTestingOrPortPicker = (props: ScreenExecutionProps): Screen =>
  screenForModeOrPortPicker("run", props);

export const screenForWatchOrPortPicker = (props: ScreenExecutionProps): Screen =>
  screenForModeOrPortPicker("watch", props);

interface NavigationStore {
  screen: Screen;
  previousScreen: Screen;
  navigateTo: (screen: Screen) => void;
  setScreen: (screen: Screen) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  screen: Screen.Main(),
  previousScreen: Screen.Main(),
  navigateTo: (screen) => set((state) => ({ screen, previousScreen: state.screen })),
  setScreen: (screen) => set({ screen }),
}));
