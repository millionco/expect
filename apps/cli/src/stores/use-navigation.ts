import { create } from "zustand";
import * as Data from "effect/Data";
import type { TestPlan, TestReport } from "@browser-tester/supervisor";

export type Screen = Data.TaggedEnum<{
  Main: {};
  SelectPr: {};
  Planning: { instruction: string };
  ReviewPlan: { plan: TestPlan };
  CookieSyncConfirm: { plan: TestPlan };
  Testing: { plan: TestPlan };
  Results: { report: TestReport };
  Theme: {};
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
