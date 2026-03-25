import { create } from "zustand";
import * as Data from "effect/Data";
import type { ChangesFor, SavedFlow, TestReport } from "@expect/shared/models";

export type Screen = Data.TaggedEnum<{
  Main: {};
  SelectPr: {};
  CookieSyncConfirm: { changesFor: ChangesFor; instruction: string; savedFlow?: SavedFlow };
  Testing: {
    changesFor: ChangesFor;
    instruction: string;
    savedFlow?: SavedFlow;
    requiresCookies?: boolean;
  };
  Results: { report: TestReport; replayUrl?: string };
  SavedFlowPicker: {};
}>;
export const Screen = Data.taggedEnum<Screen>();

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
