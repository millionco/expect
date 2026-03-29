import { create } from "zustand";
import * as Data from "effect/Data";
import type { ChangesFor, SavedFlow, TestReport } from "@expect/shared/models";
import { containsUrl } from "../utils/detect-url";

export type Screen = Data.TaggedEnum<{
  Main: {};
  SelectPr: {};
  CookieSyncConfirm: { changesFor?: ChangesFor; instruction?: string; savedFlow?: SavedFlow };
  PortPicker: {
    changesFor: ChangesFor;
    instruction: string;
    savedFlow?: SavedFlow;
    cookieBrowserKeys?: readonly string[];
  };
  Testing: {
    changesFor: ChangesFor;
    instruction: string;
    savedFlow?: SavedFlow;
    cookieBrowserKeys?: readonly string[];
    baseUrls?: readonly string[];
  };
  Results: { report: TestReport; replayUrl?: string; localReplayUrl?: string; videoUrl?: string };
  SavedFlowPicker: {};
  Watch: {
    changesFor: ChangesFor;
    instruction: string;
    cookieBrowserKeys?: readonly string[];
    baseUrl?: string;
  };
  AgentPicker: {};
}>;
export const Screen = Data.taggedEnum<Screen>();

export const screenForTestingOrPortPicker = (props: {
  changesFor: ChangesFor;
  instruction: string;
  savedFlow?: SavedFlow;
  cookieBrowserKeys?: readonly string[];
}): Screen => (containsUrl(props.instruction) ? Screen.Testing(props) : Screen.PortPicker(props));

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
